# ADR 0001: Pi SDK as the agent runtime

## Decision

Use `@earendil-works/pi-coding-agent` as the in-process agent runtime.

## Rationale

- Provides streaming events, tool execution, sessions, context compaction, model selection, thinking levels, and MCP extensions.
- Keeps the agent loop in one TypeScript service and avoids a second orchestration framework.
- The SDK exposes low-level hooks (`tool_call`, `tool_result`, `context`) needed for enterprise policy and redaction.

## Constraints

- Pi SDK 1.3.0 requires Node.js >= 22.19.0. The project requires Node.js >= 22.22.3 because the Nest CLI dependency chain requires it.
- The coding agent ships built-in coding tools. PiChat must disable `read`, `write`, `edit`, and `bash` and register only knowledge-base tools.
- Extensions run with the same OS permissions as the runtime. Only admin-approved extensions may load.
- Use an isolated working directory and do not place uploaded files in the runtime `cwd`.

## Deferred

- Per-session subprocess isolation via Pi RPC mode.
- MCP tool marketplace and OAuth token management.
- CLI sandbox execution.
