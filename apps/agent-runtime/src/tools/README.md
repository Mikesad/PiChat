# Tools

Implemented Pi tools:

- `kb_search`: retrieve chunks from allowed documents.
- `kb_read`: read more chunks from a document referenced by a `kb_search` citation index.

Both tools receive the authenticated principal from the runtime, never from model input. Authorization is computed by the business API via `/internal/access/*`; `document_ids` sent to RAGFlow are derived server-side.

Disabled: built-in `read`, `write`, `edit`, `bash`; `web.search` and `cli.exec` are not implemented.
