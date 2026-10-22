import { createSseParser, type SseEvent } from "@pichat/shared";

export async function consumeChatStream(
  response: Response,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("stream_body_missing");
  }

  const decoder = new TextDecoder();
  const parser = createSseParser(onEvent);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value && value.length > 0) {
        parser.push(decoder.decode(value, { stream: true }));
      }
    }
    parser.push(decoder.decode());
    parser.flush();
  } finally {
    await reader.cancel().catch(() => {});
  }
}
