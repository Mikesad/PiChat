import { describe, expect, it } from "vitest";
import { createSseParser, encodeSseEvent, encodeSseHeartbeat, type SseEvent } from "./sse.js";

describe("sse", () => {
  it("parses events split across chunks", () => {
    const events: SseEvent[] = [];
    const parser = createSseParser((event) => events.push(event));

    parser.push('event: run.start\nid: r1:1\ndata: {"runId":"r1",');
    parser.push('"sessionId":"s1"}\n\n');
    parser.push(encodeSseHeartbeat());
    parser.push('event: text.delta\ndata: {"delta":"你"}\n\n');

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      id: "r1:1",
      type: "run.start",
      data: { runId: "r1", sessionId: "s1" },
    });
    expect(events[1]).toMatchObject({ type: "text.delta", data: { delta: "你" } });
  });

  it("ignores unknown events and invalid json", () => {
    const events: SseEvent[] = [];
    const parser = createSseParser((event) => events.push(event));

    parser.push('event: not.real\ndata: {"a":1}\n\n');
    parser.push("event: text.delta\ndata: not-json\n\n");

    expect(events).toEqual([]);
  });

  it("encodes a single event with id", () => {
    const encoded = encodeSseEvent({
      id: "run:1",
      type: "usage",
      data: {
        inputTokens: 1,
        outputTokens: 2,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 3,
      },
    });

    expect(encoded).toContain("event: usage\n");
    expect(encoded).toContain("id: run:1\n");
    expect(encoded.endsWith("\n\n")).toBe(true);
  });
});
