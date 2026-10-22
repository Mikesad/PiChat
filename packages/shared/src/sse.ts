import { z } from "zod";
import {
  type ChatCitation,
  type ChatErrorPayload,
  type ChatRunStatus,
  type ChatToolCall,
  type ChatUsage,
  chatCitationSchema,
  chatToolCallSchema,
  chatUsageSchema,
} from "./chat.js";

export const sseEventTypes = [
  "run.start",
  "message.start",
  "text.delta",
  "thinking.delta",
  "tool.start",
  "tool.end",
  "citation.add",
  "approval.request",
  "usage",
  "compaction",
  "run.end",
  "error",
] as const;

export type SseEventType = (typeof sseEventTypes)[number];

const sseEventTypeSet: ReadonlySet<string> = new Set(sseEventTypes);

export function isSseEventType(value: string): value is SseEventType {
  return sseEventTypeSet.has(value);
}

export const runStartDataSchema = z.object({
  runId: z.string(),
  sessionId: z.string(),
  assistantMessageId: z.string(),
  model: z.object({
    provider: z.string(),
    modelId: z.string(),
    displayName: z.string(),
  }),
});

export type RunStartData = z.infer<typeof runStartDataSchema>;

export const toolStartDataSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  label: z.string(),
  description: z.string(),
});

export type ToolStartData = z.infer<typeof toolStartDataSchema>;

export const toolEndDataSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  status: z.enum(["ok", "error"]),
  durationMs: z.number().nonnegative().optional(),
  description: z.string().optional(),
});

export type ToolEndData = z.infer<typeof toolEndDataSchema>;

export const runEndDataSchema = z.object({
  runId: z.string(),
  sessionId: z.string(),
  assistantMessageId: z.string(),
  status: z.enum(["completed", "aborted", "error"]),
  finishReason: z.string().optional(),
  content: z.string(),
  thinking: z.string(),
  tools: z.array(chatToolCallSchema),
  citations: z.array(chatCitationSchema),
  usage: chatUsageSchema,
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      retryable: z.boolean().optional(),
    })
    .optional(),
});

export interface RunEndData {
  runId: string;
  sessionId: string;
  assistantMessageId: string;
  status: ChatRunStatus;
  finishReason?: string;
  content: string;
  thinking: string;
  tools: ChatToolCall[];
  citations: ChatCitation[];
  usage: ChatUsage;
  error?: ChatErrorPayload;
}

export const sseDataSchemas = {
  "run.start": runStartDataSchema,
  "message.start": z.object({ messageId: z.string() }),
  "text.delta": z.object({ delta: z.string() }),
  "thinking.delta": z.object({ delta: z.string() }),
  "tool.start": toolStartDataSchema,
  "tool.end": toolEndDataSchema,
  "citation.add": chatCitationSchema,
  "approval.request": z.record(z.string(), z.unknown()),
  usage: chatUsageSchema,
  compaction: z.object({
    phase: z.enum(["start", "end"]),
    reason: z.string(),
  }),
  "run.end": runEndDataSchema,
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean().optional(),
  }),
} as const;

export type SseEventDataMap = {
  [K in SseEventType]: z.infer<(typeof sseDataSchemas)[K]>;
};

export type SseEventOf<K extends SseEventType> = {
  id?: string;
  type: K;
  data: SseEventDataMap[K];
};

export type TypedSseEvent = {
  [K in SseEventType]: SseEventOf<K>;
}[SseEventType];

export const sseEventSchema = z.object({
  id: z.string().optional(),
  type: z.enum(sseEventTypes),
  data: z.record(z.string(), z.unknown()),
});

export type SseEvent = z.infer<typeof sseEventSchema>;

export function encodeSseEvent(event: SseEvent | TypedSseEvent): string {
  const lines = [`event: ${event.type}`];
  if (event.id) {
    lines.push(`id: ${event.id}`);
  }
  lines.push(`data: ${JSON.stringify(event.data)}`, "", "");
  return lines.join("\n");
}

export function encodeSseHeartbeat(): string {
  return ": ping\n\n";
}

export interface SseParser {
  push(chunk: string): void;
  flush(): void;
}

export function createSseParser(onEvent: (event: SseEvent) => void): SseParser {
  let buffer = "";
  let eventType: string | null = null;
  let eventId: string | undefined;
  let dataLines: string[] = [];

  function reset() {
    eventType = null;
    eventId = undefined;
    dataLines = [];
  }

  function emit() {
    if (!eventType) {
      reset();
      return;
    }

    const type = eventType;
    const id = eventId;
    const raw = dataLines.join("\n");
    reset();

    if (!isSseEventType(type)) {
      return;
    }

    let data: unknown = {};
    if (raw.length > 0) {
      try {
        data = JSON.parse(raw) as unknown;
      } catch {
        return;
      }
    }

    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return;
    }

    onEvent({ id, type, data: data as Record<string, unknown> });
  }

  return {
    push(chunk: string) {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.endsWith("\r")) {
          line = line.slice(0, -1);
        }

        if (line.length === 0) {
          emit();
        } else if (!line.startsWith(":")) {
          const colonIndex = line.indexOf(":");
          const field = colonIndex >= 0 ? line.slice(0, colonIndex) : line;
          let value = colonIndex >= 0 ? line.slice(colonIndex + 1) : "";
          if (value.startsWith(" ")) {
            value = value.slice(1);
          }

          if (field === "event") {
            eventType = value;
          } else if (field === "data") {
            dataLines.push(value);
          } else if (field === "id") {
            eventId = value;
          }
        }

        newlineIndex = buffer.indexOf("\n");
      }
    },
    flush() {
      if (buffer.length > 0) {
        if (buffer.endsWith("\r")) {
          buffer = buffer.slice(0, -1);
        }
        if (buffer.startsWith("data:")) {
          const value = buffer.slice(5).replace(/^ /, "");
          dataLines.push(value);
        }
        buffer = "";
      }
      if (dataLines.length > 0) {
        emit();
      }
    },
  };
}
