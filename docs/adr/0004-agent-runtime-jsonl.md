# ADR 0004: Agent Runtime session storage and chat ownership

## Decision

- The Agent Runtime persists Pi sessions as JSONL under `AGENT_RUNTIME_DATA_DIR`.
- The business API (`apps/api`) owns the product chat transcript in MySQL `messages`.
- The Runtime emits a final `run.end` snapshot; the API writes it to MySQL and never reads JSONL.
- Runtime tools resolve ACL through internal API endpoints (`/internal/access/scope`, `/internal/access/check`) instead of connecting to the business database.
- `kb_read` accepts only a citation index returned by `kb_search`, never a model-supplied `documentId`.

## Rationale

- JSONL is the natural Pi session format: it preserves tool calls, tool results, compaction, and model/tool loadouts needed to resume the agent context.
- MySQL `messages` is optimized for the product: tenant-scoped queries, session lists, citations, run status, usage, and retry metadata.
- Keeping the two stores separate avoids the Runtime writing chat tables and avoids the API parsing JSONL.
- The API already owns ACL and tenant context; exposing it over `/internal/*` keeps a single ACL implementation and makes revocation effective on the next tool call.
- Restricting `kb_read` to citation indexes keeps `documentIds` server-derived, matching the ACL invariant.

## Consequences

- Both stores are written from the same run. If JSONL is lost, the API can rebuild a degraded history from MySQL text; if MySQL write fails, JSONL still holds the agent context.
- Runtime disk is session-critical. Multi-instance deployment requires shared storage and session affinity, or a later migration of Pi session storage to a shared backend.
- `/internal/*` endpoints require `INTERNAL_SHARED_SECRET`; the Runtime must never be exposed publicly.
- The API key is decrypted per run, passed only over the internal network, and discarded when the run ends.
