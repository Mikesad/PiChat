"use client";

import type {
  ChatCitation,
  ChatMessageSummary,
  ChatRunStatus,
  ChatSessionSummary,
  ThinkingLevel,
  ToolEndData,
  ToolStartData,
} from "@pichat/shared";
import { maxPageSize, resolveCitationUsage } from "@pichat/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  abortChatRun,
  apiErrorMessage,
  createChatSession,
  fetchChatMessages,
  fetchChatSessions,
  fetchKnowledgeBases,
  streamChatMessage,
} from "@/lib/api-client";
import type { ChatMessage, KnowledgeBase, MessageStatus, Session, ToolCall } from "@/lib/chat-data";
import { consumeChatStream } from "@/lib/chat-stream";
import { formatTime } from "@/lib/utils";
import { useToast } from "./admin/toast";
import { ChatHeader } from "./chat-header";
import { CitationsPanel } from "./citations-panel";
import { Composer } from "./composer";
import { DocumentPreviewDialog } from "./document-preview-dialog";
import { EmptyState } from "./empty-state";
import { KnowledgeBasePicker } from "./knowledge-base-picker";
import { MessageList } from "./message-list";
import { useModelConfig } from "./model-config/model-config-provider";
import { Sidebar } from "./sidebar";

type RunStatus = "idle" | "thinking" | "streaming";

interface RunStartData {
  runId: string;
  sessionId: string;
  assistantMessageId: string;
}

interface TextDeltaData {
  delta: string;
}

interface ErrorData {
  code: string;
  message: string;
}

interface RunEndData {
  runId: string;
  sessionId: string;
  assistantMessageId: string;
  status: ChatRunStatus;
  content: string;
  thinking: string;
  tools: Array<{
    id: string;
    name: string;
    label?: string;
    description: string;
    status: "running" | "done" | "error";
    durationMs?: number;
  }>;
  citations: ChatCitation[];
  error?: { message?: string };
}

export function ChatWorkspace() {
  const { showToast } = useToast();
  const { activeConfig, ready: modelsReady } = useModelConfig();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const [draft, setDraft] = useState("");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [loadingThread, setLoadingThread] = useState(false);
  const [selectedCitationId, setSelectedCitationId] = useState<string | null>(null);
  const [previewCitation, setPreviewCitation] = useState<ChatCitation | null>(null);
  const [citationsOpen, setCitationsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [knowledgeBasePickerOpen, setKnowledgeBasePickerOpen] = useState(false);
  const [knowledgeBaseSelections, setKnowledgeBaseSelections] = useState<Record<string, string[]>>(
    {},
  );
  const [draftKnowledgeBaseIds, setDraftKnowledgeBaseIds] = useState<string[] | null>(null);

  const runIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const didMountRef = useRef(false);
  const citationsDrawerRef = useRef<HTMLDivElement>(null);
  const sidebarReturnFocusRef = useRef<HTMLElement | null>(null);
  const citationsReturnFocusRef = useRef<HTMLElement | null>(null);

  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const messages = activeSessionId ? (threads[activeSessionId] ?? []) : [];
  const allKnowledgeBaseIds = useMemo(
    () => knowledgeBases.map((knowledgeBase) => knowledgeBase.id),
    [knowledgeBases],
  );
  const selectedKnowledgeBaseIds = useMemo(() => {
    const selection = activeSessionId
      ? knowledgeBaseSelections[activeSessionId]
      : (draftKnowledgeBaseIds ?? undefined);
    if (selection === undefined) {
      return allKnowledgeBaseIds;
    }
    const available = new Set(allKnowledgeBaseIds);
    return selection.filter((id) => available.has(id));
  }, [activeSessionId, allKnowledgeBaseIds, draftKnowledgeBaseIds, knowledgeBaseSelections]);

  const citationState = useMemo(() => {
    const thread = activeSessionId ? (threads[activeSessionId] ?? []) : [];
    if (selectedCitationId) {
      for (const message of thread) {
        if (message.role !== "assistant") {
          continue;
        }
        const messageCitations = [
          ...(message.citations ?? []),
          ...(message.candidateCitations ?? []),
        ];
        if (messageCitations.some((citation) => citation.id === selectedCitationId)) {
          return {
            citations: message.citations ?? [],
            candidates: message.candidateCitations ?? [],
          };
        }
      }
    }
    for (let index = thread.length - 1; index >= 0; index -= 1) {
      const message = thread[index];
      if (message?.role === "assistant") {
        return {
          citations: message.citations ?? [],
          candidates: message.candidateCitations ?? [],
        };
      }
    }
    return { citations: [], candidates: [] };
  }, [threads, activeSessionId, selectedCitationId]);
  const { citations, candidates } = citationState;

  const openSidebar = useCallback(() => {
    sidebarReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSidebarOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    const target = sidebarReturnFocusRef.current;
    sidebarReturnFocusRef.current = null;
    window.requestAnimationFrame(() => target?.focus());
  }, []);

  const applyKnowledgeBases = useCallback(
    (ids: string[]) => {
      const available = new Set(allKnowledgeBaseIds);
      const next = ids.filter((id) => available.has(id));
      if (activeSessionId) {
        setKnowledgeBaseSelections((previous) => ({ ...previous, [activeSessionId]: next }));
      } else {
        setDraftKnowledgeBaseIds(next);
      }
      setKnowledgeBasePickerOpen(false);
    },
    [activeSessionId, allKnowledgeBaseIds],
  );

  const openCitations = useCallback(() => {
    citationsReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCitationsOpen(true);
  }, []);

  const closeCitations = useCallback(() => {
    setCitationsOpen(false);
    const target = citationsReturnFocusRef.current;
    citationsReturnFocusRef.current = null;
    window.requestAnimationFrame(() => target?.focus());
  }, []);

  useEffect(() => {
    if (citationsOpen) {
      citationsDrawerRef.current?.focus();
    }
  }, [citationsOpen]);

  useEffect(() => {
    const sidebarQuery = window.matchMedia("(min-width: 1024px)");
    const citationsQuery = window.matchMedia("(min-width: 1280px)");

    function handleBreakpointChange() {
      if (sidebarQuery.matches) {
        sidebarReturnFocusRef.current = null;
        setSidebarOpen(false);
      }
      if (citationsQuery.matches) {
        citationsReturnFocusRef.current = null;
        setCitationsOpen(false);
      }
    }

    sidebarQuery.addEventListener("change", handleBreakpointChange);
    citationsQuery.addEventListener("change", handleBreakpointChange);
    return () => {
      sidebarQuery.removeEventListener("change", handleBreakpointChange);
      citationsQuery.removeEventListener("change", handleBreakpointChange);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || previewCitation) {
        return;
      }
      if (sidebarOpen) {
        closeSidebar();
      }
      if (citationsOpen) {
        closeCitations();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen, citationsOpen, closeSidebar, closeCitations, previewCitation]);

  useEffect(() => {
    const container = threadScrollRef.current;
    const lastMessage = messages[messages.length - 1];
    if (!container || !lastMessage) {
      return;
    }
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (!nearBottomRef.current) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  const refreshSessions = useCallback(async () => {
    try {
      const response = await fetchChatSessions();
      setSessions(response.sessions.map(toUiSession));
    } catch {
      // Keep the current list; the next action will retry.
    }
  }, []);

  const loadThread = useCallback(
    async (sessionId: string) => {
      setLoadingThread(true);
      try {
        const response = await fetchChatMessages(sessionId);
        setThreads((previous) => ({
          ...previous,
          [sessionId]: response.messages.map(toUiMessage),
        }));
        setSessions((previous) =>
          previous.map((session) =>
            session.id === sessionId ? toUiSession(response.session) : session,
          ),
        );
      } catch (error) {
        setThreads((previous) => ({ ...previous, [sessionId]: [] }));
        showToast(apiErrorMessage(error), "danger");
      } finally {
        setLoadingThread(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const [sessionResponse, knowledgeResponse] = await Promise.all([
          fetchChatSessions(),
          fetchKnowledgeBases({ pageSize: maxPageSize }),
        ]);
        if (cancelled) {
          return;
        }
        const nextSessions = sessionResponse.sessions.map(toUiSession);
        setSessions(nextSessions);
        setKnowledgeBases(
          knowledgeResponse.knowledgeBases.map((knowledgeBase) => ({
            id: knowledgeBase.id,
            name: knowledgeBase.name,
            documentCount: knowledgeBase.readableDocumentCount,
          })),
        );
        if (nextSessions[0]) {
          setActiveSessionId(nextSessions[0].id);
        }
      } catch (error) {
        if (!cancelled) {
          showToast(apiErrorMessage(error), "danger");
        }
      }
    }
    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }
    if (threads[activeSessionId] !== undefined) {
      return;
    }
    void loadThread(activeSessionId);
  }, [activeSessionId, threads, loadThread]);

  const updateMessage = useCallback(
    (sessionId: string, messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
      setThreads((previous) => {
        const thread = previous[sessionId];
        if (!thread) {
          return previous;
        }
        return {
          ...previous,
          [sessionId]: thread.map((message) =>
            message.id === messageId ? updater(message) : message,
          ),
        };
      });
    },
    [],
  );

  const handleEvent = useCallback(
    (sessionId: string, assistantId: string, event: { type: string; data: unknown }) => {
      const data = event.data as Record<string, unknown>;

      switch (event.type) {
        case "run.start": {
          const start = data as unknown as RunStartData;
          runIdRef.current = start.runId;
          setRunStatus("thinking");
          break;
        }
        case "text.delta": {
          const delta = data as unknown as TextDeltaData;
          if (typeof delta.delta !== "string" || delta.delta.length === 0) {
            return;
          }
          updateMessage(sessionId, assistantId, (message) => ({
            ...message,
            content: message.content + delta.delta,
            status: "streaming",
          }));
          setRunStatus("streaming");
          break;
        }
        case "thinking.delta": {
          const delta = data as unknown as TextDeltaData;
          if (typeof delta.delta !== "string" || delta.delta.length === 0) {
            return;
          }
          updateMessage(sessionId, assistantId, (message) => ({
            ...message,
            thinking: `${message.thinking ?? ""}${delta.delta}`,
          }));
          break;
        }
        case "tool.start": {
          const tool = data as unknown as ToolStartData;
          updateMessage(sessionId, assistantId, (message) => {
            const existing = message.tools ?? [];
            if (existing.some((item) => item.id === tool.toolCallId)) {
              return message;
            }
            return {
              ...message,
              tools: [
                ...existing,
                {
                  id: tool.toolCallId,
                  name: tool.label || tool.toolName,
                  description: tool.description,
                  status: "running",
                },
              ],
            };
          });
          break;
        }
        case "tool.end": {
          const tool = data as unknown as ToolEndData;
          updateMessage(sessionId, assistantId, (message) => ({
            ...message,
            tools: (message.tools ?? []).map((item) =>
              item.id === tool.toolCallId
                ? {
                    ...item,
                    status: tool.status === "error" ? "error" : "done",
                    durationMs: tool.durationMs,
                    description: tool.description ?? item.description,
                  }
                : item,
            ),
          }));
          break;
        }
        case "citation.add": {
          const citation = data as unknown as ChatCitation;
          if (typeof citation.id !== "string") {
            return;
          }
          updateMessage(sessionId, assistantId, (message) => {
            const existing = message.candidateCitations ?? [];
            if (
              existing.some((item) => item.id === citation.id) ||
              message.citations?.some((item) => item.id === citation.id)
            ) {
              return message;
            }
            return {
              ...message,
              candidateCitations: [...existing, citation].sort(
                (left, right) => left.index - right.index,
              ),
            };
          });
          break;
        }
        case "error": {
          const error = data as unknown as ErrorData;
          updateMessage(sessionId, assistantId, (message) => ({
            ...message,
            status: "error",
            error: error.message,
          }));
          break;
        }
        case "run.end": {
          const end = data as unknown as RunEndData;
          const resolved = resolveCitationUsage(end.citations ?? [], end.content);
          updateMessage(sessionId, assistantId, (message) => ({
            ...message,
            content: end.content,
            thinking: end.thinking,
            tools: (end.tools ?? []).map((tool) => ({
              id: tool.id,
              name: tool.name,
              description: tool.description,
              status: tool.status,
              durationMs: tool.durationMs,
            })),
            citations: resolved.filter((citation) => citation.used === true),
            candidateCitations: resolved.filter((citation) => citation.used !== true),
            status: toMessageStatus(end.status),
            error: end.error?.message,
          }));
          setRunStatus("idle");
          break;
        }
        default:
          break;
      }
    },
    [updateMessage],
  );

  const send = useCallback(
    async (raw: string, thinkingLevel: ThinkingLevel = "medium", retry = false) => {
      const text = raw.trim();
      if (!text || runStatus !== "idle") {
        return;
      }
      if (modelsReady && !activeConfig) {
        showToast("请先在左下角账号菜单中配置模型。", "danger");
        return;
      }

      const selectedIdsForRun = knowledgeBases.length === 0 ? undefined : selectedKnowledgeBaseIds;
      let sessionId = activeSessionId;
      try {
        if (!sessionId) {
          const created = await createChatSession({});
          sessionId = created.session.id;
          setSessions((previous) => [toUiSession(created.session), ...previous]);
          setThreads((previous) => ({ ...previous, [sessionId as string]: [] }));
          setActiveSessionId(sessionId);
        }
      } catch (error) {
        showToast(apiErrorMessage(error), "danger");
        return;
      }

      const targetSessionId = sessionId as string;
      if (!activeSessionId) {
        if (selectedIdsForRun !== undefined) {
          setKnowledgeBaseSelections((previous) => ({
            ...previous,
            [targetSessionId]: selectedIdsForRun,
          }));
        }
        setDraftKnowledgeBaseIds(null);
      }
      const assistantId = `assistant-${Date.now()}`;
      const timestamp = new Date().toISOString();
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        createdAt: timestamp,
        status: "done",
      };
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: timestamp,
        status: "thinking",
        thinking: "",
        tools: [],
        citations: [],
      };

      setThreads((previous) => ({
        ...previous,
        [targetSessionId]: [
          ...(previous[targetSessionId] ?? []),
          ...(retry ? [] : [userMessage]),
          assistantMessage,
        ],
      }));
      setDraft("");
      setRunStatus("thinking");
      setSelectedCitationId(null);
      setFocusKey((value) => value + 1);
      nearBottomRef.current = true;
      runIdRef.current = null;

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await streamChatMessage(
          targetSessionId,
          {
            content: text,
            thinkingLevel,
            retry,
            webSearch: webSearchEnabled,
            knowledgeBaseIds: selectedIdsForRun,
          },
          controller.signal,
        );
        await consumeChatStream(response, (event) =>
          handleEvent(targetSessionId, assistantId, event),
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          const message = apiErrorMessage(error);
          updateMessage(targetSessionId, assistantId, (current) => ({
            ...current,
            status: "error",
            error: message,
          }));
          showToast(message, "danger");
        }
      } finally {
        setRunStatus("idle");
        runIdRef.current = null;
        abortRef.current = null;
        void refreshSessions();
      }
    },
    [
      activeConfig,
      activeSessionId,
      handleEvent,
      knowledgeBases.length,
      modelsReady,
      refreshSessions,
      runStatus,
      selectedKnowledgeBaseIds,
      showToast,
      updateMessage,
      webSearchEnabled,
    ],
  );

  const stop = useCallback(() => {
    const runId = runIdRef.current;
    if (runId) {
      void abortChatRun(runId).catch((error) => {
        showToast(apiErrorMessage(error), "danger");
      });
      return;
    }
    abortRef.current?.abort();
    setRunStatus("idle");
  }, [showToast]);

  function handleNewChat() {
    if (runStatus !== "idle") {
      stop();
    }
    setActiveSessionId(null);
    setDraft("");
    setSelectedCitationId(null);
    closeSidebar();
    nearBottomRef.current = true;
    setFocusKey((value) => value + 1);
  }

  function handleSelectSession(id: string) {
    if (runStatus !== "idle") {
      stop();
    }
    setActiveSessionId(id);
    setSelectedCitationId(null);
    closeSidebar();
    nearBottomRef.current = true;
  }

  function handleSuggestion(text: string) {
    void send(text);
  }

  function handleRetry() {
    if (runStatus !== "idle") {
      return;
    }
    const thread = activeSessionId ? (threads[activeSessionId] ?? []) : [];
    let lastUserIndex = -1;
    for (let index = thread.length - 1; index >= 0; index -= 1) {
      if (thread[index]?.role === "user") {
        lastUserIndex = index;
        break;
      }
    }
    const lastUser = thread[lastUserIndex];
    if (!lastUser || !activeSessionId) {
      return;
    }
    setThreads((previous) => ({
      ...previous,
      [activeSessionId]: (previous[activeSessionId] ?? []).slice(0, lastUserIndex + 1),
    }));
    void send(lastUser.content, "medium", true);
  }

  function handleCitationSelect(id: string) {
    setSelectedCitationId(id);
    if (!window.matchMedia("(min-width: 1280px)").matches && !citationsOpen) {
      openCitations();
    }
  }

  function handleCitationPreview(citation: ChatCitation) {
    setPreviewCitation(citation);
  }

  function handleThreadScroll() {
    const container = threadScrollRef.current;
    if (!container) {
      return;
    }
    nearBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < 120;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-fg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop"
      >
        跳到主内容
      </a>

      <Sidebar
        mode="chat"
        sessions={sessions}
        activeSessionId={activeSessionId ?? ""}
        knowledgeBases={knowledgeBases}
        mobileOpen={sidebarOpen}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onClose={closeSidebar}
      />

      <div
        className="flex min-w-0 flex-1 flex-col"
        inert={sidebarOpen || citationsOpen || previewCitation !== null || knowledgeBasePickerOpen}
      >
        <ChatHeader
          title={activeSession?.title ?? "新对话"}
          hasMessages={messages.length > 0}
          status={runStatus}
          sidebarOpen={sidebarOpen}
          citationsOpen={citationsOpen}
          onOpenSidebar={openSidebar}
          onOpenCitations={openCitations}
        />

        <div className="flex min-h-0 flex-1">
          <main id="main-content" className="flex min-w-0 flex-1 flex-col">
            <div
              ref={threadScrollRef}
              onScroll={handleThreadScroll}
              aria-busy={runStatus !== "idle"}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {loadingThread && messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-subtle">
                  正在加载会话…
                </div>
              ) : messages.length === 0 ? (
                <EmptyState knowledgeBases={knowledgeBases} onSuggestion={handleSuggestion} />
              ) : (
                <MessageList
                  messages={messages}
                  selectedCitationId={selectedCitationId}
                  onCitationSelect={handleCitationSelect}
                  onCitationPreview={handleCitationPreview}
                  onRetry={handleRetry}
                  busy={runStatus !== "idle"}
                />
              )}
            </div>

            <Composer
              value={draft}
              onChange={setDraft}
              onSend={(thinkingLevel) => void send(draft, thinkingLevel)}
              onStop={stop}
              streaming={runStatus !== "idle"}
              knowledgeBaseCount={selectedKnowledgeBaseIds.length}
              knowledgeBaseTotal={knowledgeBases.length}
              onOpenKnowledgeBasePicker={() => setKnowledgeBasePickerOpen(true)}
              focusKey={focusKey}
              webSearch={webSearchEnabled}
              onWebSearchChange={setWebSearchEnabled}
            />
          </main>

          <aside
            aria-label="引用与来源"
            className="hidden w-[336px] shrink-0 border-l border-border xl:block"
          >
            <CitationsPanel
              citations={citations}
              candidates={candidates}
              selectedId={selectedCitationId}
              onSelect={handleCitationSelect}
              onPreview={handleCitationPreview}
              pending={runStatus !== "idle"}
            />
          </aside>
        </div>
      </div>

      {knowledgeBasePickerOpen ? (
        <KnowledgeBasePicker
          options={knowledgeBases}
          selectedIds={selectedKnowledgeBaseIds}
          onApply={applyKnowledgeBases}
          onClose={() => setKnowledgeBasePickerOpen(false)}
        />
      ) : null}

      {citationsOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label="关闭引用面板"
            onClick={closeCitations}
            className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]"
          />
          <div
            ref={citationsDrawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="引用与来源"
            tabIndex={-1}
            className="animate-drawer-enter absolute inset-y-0 right-0 flex w-[min(360px,92vw)] flex-col border-l border-border bg-surface shadow-pop outline-none"
          >
            <CitationsPanel
              citations={citations}
              candidates={candidates}
              selectedId={selectedCitationId}
              onSelect={handleCitationSelect}
              onPreview={handleCitationPreview}
              onClose={closeCitations}
              pending={runStatus !== "idle"}
            />
          </div>
        </div>
      ) : null}

      {previewCitation ? (
        <DocumentPreviewDialog
          key={previewCitation.id}
          documentId={previewCitation.documentId}
          title={previewCitation.documentTitle}
          onClose={() => setPreviewCitation(null)}
        />
      ) : null}
    </div>
  );
}

function toUiSession(session: ChatSessionSummary): Session {
  const updated = new Date(session.updatedAt);
  const today = new Date();
  const isToday = updated.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const label = isToday
    ? formatTime(session.updatedAt)
    : updated.toDateString() === yesterday.toDateString()
      ? "昨天"
      : `${updated.getMonth() + 1}月${updated.getDate()}日`;

  return {
    id: session.id,
    title: session.title || "新对话",
    updatedLabel: label,
    group: isToday ? "今天" : "更早",
  };
}

function toUiMessage(message: ChatMessageSummary): ChatMessage {
  if (message.role === "user") {
    return {
      id: message.id,
      role: "user",
      content: message.content,
      createdAt: message.createdAt,
      status: "done",
    };
  }

  const metadata = message.metadata;
  const resolved = resolveCitationUsage(metadata?.citations ?? [], message.content);
  return {
    id: message.id,
    role: "assistant",
    content: message.content,
    createdAt: message.createdAt,
    status: toMessageStatus(metadata?.status),
    thinking: metadata?.thinking ?? "",
    tools: (metadata?.tools ?? []).map(toUiTool),
    citations: resolved.filter((citation) => citation.used === true),
    candidateCitations: resolved.filter((citation) => citation.used !== true),
    error: metadata?.error?.message,
  };
}

function toUiTool(tool: {
  id: string;
  name: string;
  description: string;
  status: "running" | "done" | "error";
  durationMs?: number;
}): ToolCall {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    status: tool.status,
    durationMs: tool.durationMs,
  };
}

function toMessageStatus(status: ChatRunStatus | undefined): MessageStatus {
  if (status === "aborted") {
    return "stopped";
  }
  if (status === "error") {
    return "error";
  }
  return "done";
}
