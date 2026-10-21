import type { SseEvent } from "@pichat/shared";

export interface PiRuntimeEvent {
  type: string;
  assistantMessageEvent?: {
    type: string;
    delta?: string;
  };
  toolName?: string;
  toolCallId?: string;
}

export function mapPiEvent(event: PiRuntimeEvent): SseEvent | null {
  if (event.type === "message_update" && event.assistantMessageEvent?.delta) {
    if (event.assistantMessageEvent.type === "text_delta") {
      return { type: "text.delta", data: { delta: event.assistantMessageEvent.delta } };
    }

    if (event.assistantMessageEvent.type === "thinking_delta") {
      return {
        type: "thinking.delta",
        data: { delta: event.assistantMessageEvent.delta },
      };
    }
  }

  if (event.type === "tool_execution_start") {
    return {
      type: "tool.start",
      data: {
        toolName: event.toolName ?? "unknown",
        toolCallId: event.toolCallId ?? "",
      },
    };
  }

  if (event.type === "tool_execution_end") {
    return {
      type: "tool.end",
      data: {
        toolName: event.toolName ?? "unknown",
        toolCallId: event.toolCallId ?? "",
      },
    };
  }

  if (event.type === "agent_start") {
    return { type: "run.start", data: {} };
  }

  if (event.type === "agent_end") {
    return { type: "run.end", data: {} };
  }

  return null;
}
