# ADR 0003: SSE for agent streaming

## Decision

Use Server-Sent Events for agent output. Use POST requests for prompts, steering, aborts, and approvals.

## Event types

`run.start`, `message.start`, `text.delta`, `thinking.delta`, `tool.start`, `tool.end`, `citation.add`, `approval.request`, `usage`, `compaction`, `run.end`, `error`.

## Rationale

- The stream is primarily server-to-client.
- SSE works through standard HTTP proxies and is simpler to operate than WebSocket.
- POST endpoints provide the bidirectional controls without a persistent socket.

## Future

Add `id` and `Last-Event-ID` replay backed by Redis Streams when horizontal scaling and reconnect support are implemented.
