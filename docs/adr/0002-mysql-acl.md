# ADR 0002: MySQL for metadata and application-level ACL

## Decision

Use MySQL 8 as the application metadata store. Do not use PostgreSQL RLS.

## Rationale

- The target environment already provides MySQL 8.
- RAGFlow itself uses MySQL for its own metadata.
- Document-level permission is not available in open-source RAGFlow, so PiChat must own the policy decision point.

## Consequences

- Every tenant-scoped query must include `tenant_id` explicitly. Repository helpers and integration tests enforce this.
- High-security tenants can be isolated with a separate database or schema.
- ACL checks happen before retrieval and again after retrieval.
- The retrieval adapter passes server-computed `document_ids` to RAGFlow.
- MySQL JSON is used for flexible metadata only. ACL relationships use normalized tables.
- `tenant_admin` has a break-glass read override: it can read every document even when an explicit
  deny exists. This is a role override in the policy, not an ACL row. Tenant admins are excluded from
  effective audience counts and every use of the override must be auditable.
- A user belongs to at most one department (`users.department_id`). Department membership is no
  longer many-to-many; `departments` is the department directory.
- Knowledge-base access is a prerequisite for every document: the user's department (or a direct
  user grant on the knowledge base) must have `read`, and no matching `deny` may exist.
- `documents.acl_mode` controls document narrowing:
  - `inherit`: knowledge-base access is enough; document ACL may still add a deny.
  - `restricted`: knowledge-base access plus an explicit document `read` grant is required.
  - Unknown or invalid modes fail closed.
- A document-level grant can never bypass knowledge-base access. If the department has no knowledge
  base grant, the document is denied even when `document_acls` contains a user or department read.
- Internal `/internal/access/*` requests carry only `tenantId` and `userId`. The API resolves role,
  department and account status from MySQL on every call, so a disabled account or department change
  takes effect on the next tool call without trusting Runtime-supplied identity fields.
- Citation snapshots in historical messages are rechecked against current ACL before being returned
  by the chat API.

## Not used

- PostgreSQL row-level security.
- pgvector. Vectors live in RAGFlow's Elasticsearch or Infinity document engine.
