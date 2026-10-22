# Policies

Implemented runtime policies:

- `tool-policy`: allowlist `kb_search` / `kb_read` in `tool_call`.
- `redaction`: strip obvious secret patterns from `tool_result` text.
- Built-in tools are disabled; extensions, skills, and context files are not loaded.
- Tool results never contain tenant/user IDs, RAGFlow document IDs, file paths, or API keys.

Approval is reserved for future high-risk tools and is not used in the MVP.
