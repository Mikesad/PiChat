# ADR 0005: Knowledge base lifecycle and deletion semantics

## Decision

- Knowledge base creation is synchronous: the API creates the RAGFlow dataset first, then writes the MySQL row. If RAGFlow is unavailable or the dataset cannot be created, the request fails with `503 service_unavailable` and no knowledge base row is written.
- Knowledge base names are generated as `pichat-<knowledgeBaseId>` in RAGFlow so the remote dataset is traceable to the business row.
- Deleting a knowledge base is a soft delete via `knowledge_bases.deleted_at`. Documents, document ACLs, and knowledge base default ACLs are soft-deleted or removed in the same transaction, and `acl_version` is incremented.
- Deleting a document is a soft delete via `documents.deleted_at` and `status = "deleted"`.
- Local upload directories, BullMQ jobs, and RAGFlow datasets/documents are cleaned up best-effort after the database transaction.
- Cleanup failures do not roll back the database delete and do not change the `204` response. The audit entry records `localCleanup` and `remoteCleanup` results for follow-up.
- Batch ACL updates are limited to documents in one knowledge base and use replace semantics for the full exception set. `acl_version` is incremented once per batch.
- Ingestion jobs use the deterministic id `ingest-<documentId>` (BullMQ disallows `:` in custom ids). Workers re-check `deleted_at` and use conditional updates before writing RAGFlow or document status.

## Rationale

- Synchronous creation avoids a `provisioning` state, partially usable knowledge bases, and extra UI states in the MVP.
- Soft deletion preserves audit history and avoids cascading physical deletes that would obscure which objects were removed.
- Best-effort remote cleanup keeps the product usable when Redis or RAGFlow is temporarily down; the database is the source of truth for what users can see and retrieve.
- Replace semantics make batch ACL changes predictable and match the existing single-document ACL API.
- Deterministic job ids make cancellation possible; DB guards cover the case where a job is already active and cannot be removed.

## Consequences

- The unique `(tenant_id, name)` index still applies to soft-deleted knowledge bases, so a deleted name cannot be reused without physical cleanup or renaming.
- Remote cleanup may require manual compensation when RAGFlow is unavailable; audit metadata is the discovery path.
- Every query over `knowledge_bases` must explicitly filter `deleted_at IS NULL`.
