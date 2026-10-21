# Tools

Planned Pi tools:

- `kb.search`: retrieve chunks from allowed documents.
- `kb.read`: read a permitted document range.
- `web.search`: optional external search.
- `cli.exec`: sandboxed command execution, disabled by default.

All tools receive the authenticated principal from the runtime, never from model input.
