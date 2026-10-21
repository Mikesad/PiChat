import { z } from "zod";

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

export const sseEventSchema = z.object({
  id: z.string().optional(),
  type: z.enum(sseEventTypes),
  data: z.record(z.string(), z.unknown()),
});

export type SseEvent = z.infer<typeof sseEventSchema>;

export function encodeSseEvent(event: SseEvent): string {
  const lines = [`event: ${event.type}`];
  if (event.id) {
    lines.push(`id: ${event.id}`);
  }
  lines.push(`data: ${JSON.stringify(event.data)}`, "", "");
  return lines.join("\n");
}
