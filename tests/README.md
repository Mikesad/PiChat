# Tests

Planned test layers:

- Unit: ACL decisions, SSE event mapping, RAGFlow response parsing.
- Integration: MySQL repositories, RAGFlow adapter against a recorded fixture, Pi session lifecycle.
- E2E: login, upload, parse, ask, citation, permission revocation.
- Security: cross-tenant access matrix, document ACL bypass attempts, prompt injection.
- Load: concurrent SSE streams and reconnect behavior.
