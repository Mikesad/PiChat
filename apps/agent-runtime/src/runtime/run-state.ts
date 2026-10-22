import type {
  ChatErrorPayload,
  ChatRunStatus,
  ChatToolCall,
  ChatUsage,
  RunEndData,
} from "@pichat/shared";
import { emptyChatUsage } from "@pichat/shared";
import { CitationRegistry } from "./citation-registry.js";

export interface ToolStartInput {
  toolCallId: string;
  toolName: string;
  label: string;
  description: string;
}

export interface ToolEndInput {
  toolCallId: string;
  toolName: string;
  isError: boolean;
  durationMs?: number;
  description?: string;
}

export class RunState {
  readonly runId: string;
  readonly sessionId: string;
  readonly assistantMessageId: string;
  readonly citations: CitationRegistry;
  readonly tools = new Map<string, ChatToolCall>();
  content = "";
  thinking = "";
  usage: ChatUsage = { ...emptyChatUsage };
  status: ChatRunStatus = "completed";
  finishReason: string | undefined;
  error: ChatErrorPayload | undefined;
  sawAssistant = false;

  constructor(runId: string, sessionId: string, assistantMessageId: string) {
    this.runId = runId;
    this.sessionId = sessionId;
    this.assistantMessageId = assistantMessageId;
    this.citations = new CitationRegistry(assistantMessageId);
  }

  appendText(delta: string): void {
    this.content += delta;
  }

  appendThinking(delta: string): void {
    this.thinking += delta;
  }

  addUsage(usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
  }): void {
    this.usage = {
      inputTokens: this.usage.inputTokens + usage.input,
      outputTokens: this.usage.outputTokens + usage.output,
      cacheReadTokens: this.usage.cacheReadTokens + usage.cacheRead,
      cacheWriteTokens: this.usage.cacheWriteTokens + usage.cacheWrite,
      totalTokens:
        this.usage.totalTokens +
        (usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite),
    };
  }

  startTool(input: ToolStartInput): ChatToolCall {
    const tool: ChatToolCall = {
      id: input.toolCallId,
      name: input.toolName,
      label: input.label,
      description: input.description,
      status: "running",
    };
    this.tools.set(input.toolCallId, tool);
    return tool;
  }

  endTool(input: ToolEndInput): ChatToolCall | undefined {
    const tool = this.tools.get(input.toolCallId);
    if (!tool) {
      return undefined;
    }
    tool.status = input.isError ? "error" : "done";
    tool.durationMs = input.durationMs;
    if (input.description) {
      tool.description = input.description;
    }
    return tool;
  }

  setError(error: ChatErrorPayload): void {
    this.error = error;
    this.status = "error";
  }

  snapshot(): RunEndData {
    return {
      runId: this.runId,
      sessionId: this.sessionId,
      assistantMessageId: this.assistantMessageId,
      status: this.status,
      ...(this.finishReason ? { finishReason: this.finishReason } : {}),
      content: this.content,
      thinking: this.thinking,
      tools: [...this.tools.values()],
      citations: this.citations.all(),
      usage: this.usage,
      ...(this.error ? { error: this.error } : {}),
    };
  }
}
