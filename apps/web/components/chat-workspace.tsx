"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ChatMessage,
  demoAnswer,
  demoCitations,
  demoThinking,
  knowledgeBases,
  type Session,
  seedMessages,
  seedSessions,
  type ToolCall,
} from "@/lib/chat-data";
import { ChatHeader } from "./chat-header";
import { CitationsPanel } from "./citations-panel";
import { Composer } from "./composer";
import { EmptyState } from "./empty-state";
import { MessageList } from "./message-list";
import { Sidebar } from "./sidebar";

type RunStatus = "idle" | "thinking" | "streaming";

export function ChatWorkspace() {
  const [sessions, setSessions] = useState<Session[]>(seedSessions);
  const [activeSessionId, setActiveSessionId] = useState("s1");
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({
    s1: seedMessages,
    s2: [],
    s3: [],
    s4: [],
  });
  const [draft, setDraft] = useState("");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [selectedCitationId, setSelectedCitationId] = useState<string | null>(null);
  const [citationsOpen, setCitationsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [focusKey, setFocusKey] = useState(0);

  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runRef = useRef<{ sessionId: string; assistantId: string } | null>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const didMountRef = useRef(false);
  const citationsDrawerRef = useRef<HTMLDivElement>(null);
  const sidebarReturnFocusRef = useRef<HTMLElement | null>(null);
  const citationsReturnFocusRef = useRef<HTMLElement | null>(null);

  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const messages = threads[activeSessionId] ?? [];

  const citations = useMemo(() => {
    const thread = threads[activeSessionId] ?? [];
    if (selectedCitationId) {
      for (const message of thread) {
        if (
          message.role === "assistant" &&
          message.citations?.some((citation) => citation.id === selectedCitationId)
        ) {
          return message.citations;
        }
      }
    }
    for (let index = thread.length - 1; index >= 0; index -= 1) {
      const message = thread[index];
      if (message?.role === "assistant") {
        return message.citations ?? [];
      }
    }
    return [];
  }, [threads, activeSessionId, selectedCitationId]);

  const clearRun = useCallback(() => {
    for (const timer of timersRef.current) {
      clearTimeout(timer);
    }
    timersRef.current = [];
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

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

  useEffect(() => clearRun, [clearRun]);

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
      if (event.key !== "Escape") {
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
  }, [sidebarOpen, citationsOpen, closeSidebar, closeCitations]);

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

  const patchMessage = useCallback(
    (sessionId: string, messageId: string, patch: Partial<ChatMessage>) => {
      setThreads((previous) => {
        const thread = previous[sessionId] ?? [];
        return {
          ...previous,
          [sessionId]: thread.map((message) =>
            message.id === messageId ? { ...message, ...patch } : message,
          ),
        };
      });
    },
    [],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || runStatus !== "idle") {
        return;
      }

      const sessionId = activeSessionId;
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
        thinking: demoThinking,
        tools: [],
        citations: [],
      };

      setThreads((previous) => ({
        ...previous,
        [sessionId]: [...(previous[sessionId] ?? []), userMessage, assistantMessage],
      }));
      setDraft("");
      setRunStatus("thinking");
      setSelectedCitationId(null);
      setFocusKey((value) => value + 1);
      nearBottomRef.current = true;
      runRef.current = { sessionId, assistantId };

      setSessions((previous) =>
        previous.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                title: session.title === "新对话" ? text.slice(0, 24) : session.title,
                updatedLabel: "刚刚",
              }
            : session,
        ),
      );

      const searchId = `tool-search-${assistantId}`;
      const readId = `tool-read-${assistantId}`;

      timersRef.current.push(
        setTimeout(() => {
          patchMessage(sessionId, assistantId, {
            tools: [
              {
                id: searchId,
                name: "kb.search",
                description: `query=${text.slice(0, 28)} · 检索 ${knowledgeBases.length} 个已授权知识库`,
                status: "running",
              },
            ],
          });
        }, 700),
        setTimeout(() => {
          patchMessage(sessionId, assistantId, {
            tools: [
              {
                id: searchId,
                name: "kb.search",
                description: `query=${text.slice(0, 28)} · 命中 6 个片段`,
                status: "done",
                durationMs: 386,
              },
              {
                id: readId,
                name: "kb.read",
                description: "读取命中文档并复核权限",
                status: "running",
              },
            ],
          });
        }, 1400),
        setTimeout(() => {
          patchMessage(sessionId, assistantId, {
            tools: [
              {
                id: searchId,
                name: "kb.search",
                description: `query=${text.slice(0, 28)} · 命中 6 个片段`,
                status: "done",
                durationMs: 386,
              },
              {
                id: readId,
                name: "kb.read",
                description: "读取 2 份文档：差旅管理制度、员工报销管理办法",
                status: "done",
                durationMs: 164,
              },
            ],
          });
        }, 2000),
        setTimeout(() => {
          patchMessage(sessionId, assistantId, {
            citations: demoCitations,
            status: "streaming",
          });
          setRunStatus("streaming");

          const characters = Array.from(demoAnswer);
          let index = 0;
          intervalRef.current = setInterval(() => {
            index = Math.min(index + 3, characters.length);
            patchMessage(sessionId, assistantId, {
              content: characters.slice(0, index).join(""),
            });

            if (index >= characters.length) {
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }
              patchMessage(sessionId, assistantId, { status: "done" });
              setRunStatus("idle");
              runRef.current = null;
              timersRef.current = [];
            }
          }, 24);
        }, 2400),
      );
    },
    [activeSessionId, patchMessage, runStatus],
  );

  const stop = useCallback(() => {
    clearRun();
    const run = runRef.current;
    if (run) {
      setThreads((previous) => {
        const thread = previous[run.sessionId] ?? [];
        return {
          ...previous,
          [run.sessionId]: thread.map((message) =>
            message.id === run.assistantId
              ? {
                  ...message,
                  status: "stopped",
                  tools: message.tools?.map((tool: ToolCall) =>
                    tool.status === "running" ? { ...tool, status: "done" } : tool,
                  ),
                }
              : message,
          ),
        };
      });
    }
    runRef.current = null;
    setRunStatus("idle");
  }, [clearRun]);

  function handleNewChat() {
    if (runStatus !== "idle") {
      stop();
    }
    const id = `session-${Date.now()}`;
    setSessions((previous) => [
      { id, title: "新对话", updatedLabel: "刚刚", group: "今天" },
      ...previous,
    ]);
    setThreads((previous) => ({ ...previous, [id]: [] }));
    setActiveSessionId(id);
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
    send(text);
  }

  function handleRetry() {
    if (runStatus !== "idle") {
      return;
    }
    const thread = threads[activeSessionId] ?? [];
    let lastUserIndex = -1;
    for (let index = thread.length - 1; index >= 0; index -= 1) {
      if (thread[index]?.role === "user") {
        lastUserIndex = index;
        break;
      }
    }
    const lastUser = thread[lastUserIndex];
    if (!lastUser) {
      return;
    }
    setThreads((previous) => ({
      ...previous,
      [activeSessionId]: (previous[activeSessionId] ?? []).slice(0, lastUserIndex),
    }));
    send(lastUser.content);
  }

  function handleCitationSelect(id: string) {
    setSelectedCitationId(id);
    if (!window.matchMedia("(min-width: 1280px)").matches && !citationsOpen) {
      openCitations();
    }
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
        activeSessionId={activeSessionId}
        knowledgeBases={knowledgeBases}
        mobileOpen={sidebarOpen}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onClose={closeSidebar}
      />

      <div className="flex min-w-0 flex-1 flex-col" inert={sidebarOpen || citationsOpen}>
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
              {messages.length === 0 ? (
                <EmptyState knowledgeBases={knowledgeBases} onSuggestion={handleSuggestion} />
              ) : (
                <MessageList
                  messages={messages}
                  selectedCitationId={selectedCitationId}
                  onCitationSelect={handleCitationSelect}
                  onRetry={handleRetry}
                  busy={runStatus !== "idle"}
                />
              )}
            </div>

            <Composer
              value={draft}
              onChange={setDraft}
              onSend={() => send(draft)}
              onStop={stop}
              streaming={runStatus !== "idle"}
              knowledgeBaseCount={knowledgeBases.length}
              focusKey={focusKey}
            />
          </main>

          <aside
            aria-label="引用与来源"
            className="hidden w-[336px] shrink-0 border-l border-border xl:block"
          >
            <CitationsPanel
              citations={citations}
              selectedId={selectedCitationId}
              onSelect={handleCitationSelect}
              pending={runStatus !== "idle"}
            />
          </aside>
        </div>
      </div>

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
              selectedId={selectedCitationId}
              onSelect={handleCitationSelect}
              onClose={closeCitations}
              pending={runStatus !== "idle"}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
