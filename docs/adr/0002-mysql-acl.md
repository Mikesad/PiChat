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

## Not used

- PostgreSQL row-level security.
- pgvector. Vectors live in RAGFlow's Elasticsearch or Infinity document engine.
