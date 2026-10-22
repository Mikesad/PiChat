import { z } from "zod";
import type { ThinkingLevel } from "./domain.js";

export const chatCitationSchema = z.object({
  id: z.string(),
  index: z.number().int().positive(),
  documentId: z.string(),
  documentTitle: z.string(),
  knowledgeBaseId: z.string(),
  knowledgeBaseName: z.string(),
  chunkId: z.string(),
  snippet: z.string(),
});

export type ChatCitation = z.infer<typeof chatCitationSchema>;

export const chatToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  description: z.string(),
  status: z.enum(["running", "done", "error"]),
  durationMs: z.number().nonnegative().optional(),
});

export type ChatToolCall = z.infer<typeof chatToolCallSchema>;

export const chatUsageSchema = z.object({
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  cacheReadTokens: z.number().nonnegative(),
  cacheWriteTokens: z.number().nonnegative(),
  totalTokens: z.number().nonnegative(),
});

export type ChatUsage = z.infer<typeof chatUsageSchema>;

export const emptyChatUsage: ChatUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
};

export type ChatRunStatus = "completed" | "aborted" | "error";
export type ChatMessageStatus = "thinking" | "streaming" | "done" | "stopped" | "error";

export interface ChatErrorPayload {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface ChatModelDescriptor {
  provider: string;
  modelId: string;
  displayName: string;
}

export interface ChatMessageMetadata {
  runId?: string;
  status?: ChatRunStatus;
  model?: ChatModelDescriptor;
  thinkingLevel?: ThinkingLevel;
  thinking?: string;
  tools?: ChatToolCall[];
  citations?: ChatCitation[];
  usage?: ChatUsage;
  error?: ChatErrorPayload;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  modelProvider: string;
  modelId: string;
  thinkingLevel: ThinkingLevel;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageSummary {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  metadata: ChatMessageMetadata | null;
}

export interface ChatSessionListResponse {
  sessions: ChatSessionSummary[];
}

export interface ChatSessionResponse {
  session: ChatSessionSummary;
}

export interface ChatMessagesResponse {
  session: ChatSessionSummary;
  messages: ChatMessageSummary[];
}

export interface CreateChatSessionRequest {
  title?: string;
  modelConfigId?: string;
}

export interface SendChatMessageRequest {
  content: string;
  modelConfigId?: string;
  thinkingLevel?: ThinkingLevel;
  retry?: boolean;
}

export const chatThinkingLevels = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly ThinkingLevel[];
