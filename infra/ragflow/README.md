# RAGFlow

PiChat uses RAGFlow only as a parsing and retrieval engine. It does not use RAGFlow Chat or RAGFlow Agent.

## Local deployment

Use the official RAGFlow Docker Compose deployment, or the existing `D:\AI Project\ragflow` checkout. RAGFlow brings its own MySQL, Elasticsearch or Infinity, MinIO, Redis/Kvrocks, and NATS dependencies.

Set the following in the root `.env`:

```dotenv
RAGFLOW_BASE_URL=http://localhost:9380
RAGFLOW_API_KEY=ragflow-api-key
```

## Boundaries

- Keep the RAGFlow API key server-side. The browser must never call RAGFlow directly.
- Use a separate database and database user for PiChat metadata. Do not write to RAGFlow tables.
- RAGFlow open source permissions are dataset-level. Document-level authorization is enforced by PiChat.
- Retrieval requests must include both `dataset_ids` and the server-computed `document_ids`.
- RAGFlow returns chunks; PiChat applies a second ACL check before sending chunks to the model.
