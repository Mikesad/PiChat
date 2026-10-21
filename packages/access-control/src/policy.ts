import type {
  AccessPrincipal,
  AclEntry,
  DocumentAccessDecision,
  DocumentRef,
  KnowledgeBaseAclEntry,
} from "./types.js";

function matchesPrincipal(
  entry: { subjectType: "user" | "group"; subjectId: string },
  principal: AccessPrincipal,
): boolean {
  if (entry.subjectType === "user") {
    return entry.subjectId === principal.userId;
  }
  return principal.groupIds.includes(entry.subjectId);
}

function belongsToTenant(entry: { tenantId?: string }, principal: AccessPrincipal): boolean {
  return entry.tenantId === undefined || entry.tenantId === principal.tenantId;
}

export function decideDocumentAccess(
  entries: AclEntry[],
  principal: AccessPrincipal,
  documentId: string,
): DocumentAccessDecision {
  if (principal.role === "tenant_admin") {
    return { allowed: true, reason: "role_override" };
  }

  const relevant = entries.filter(
    (entry) =>
      entry.documentId === documentId &&
      belongsToTenant(entry, principal) &&
      matchesPrincipal(entry, principal),
  );

  if (relevant.some((entry) => entry.permission === "deny")) {
    return { allowed: false, reason: "explicit_deny" };
  }

  if (relevant.some((entry) => entry.permission === "read")) {
    return { allowed: true, reason: "allowed" };
  }

  return { allowed: false, reason: "no_grant" };
}

export function decideEffectiveDocumentAccess(
  defaults: KnowledgeBaseAclEntry[],
  exceptions: AclEntry[],
  principal: AccessPrincipal,
  documentId: string,
  knowledgeBaseId: string,
): DocumentAccessDecision {
  if (principal.role === "tenant_admin") {
    return { allowed: true, reason: "role_override" };
  }

  const relevantDefaults = defaults.filter(
    (entry) =>
      entry.knowledgeBaseId === knowledgeBaseId &&
      belongsToTenant(entry, principal) &&
      matchesPrincipal(entry, principal),
  );
  const relevantExceptions = exceptions.filter(
    (entry) =>
      entry.documentId === documentId &&
      entry.knowledgeBaseId === knowledgeBaseId &&
      belongsToTenant(entry, principal) &&
      matchesPrincipal(entry, principal),
  );

  const relevant = [...relevantDefaults, ...relevantExceptions];

  if (relevant.some((entry) => entry.permission === "deny")) {
    return { allowed: false, reason: "explicit_deny" };
  }

  if (relevant.some((entry) => entry.permission === "read")) {
    return { allowed: true, reason: "allowed" };
  }

  return { allowed: false, reason: "no_grant" };
}

export function listReadableDocumentIds(
  entries: AclEntry[],
  principal: AccessPrincipal,
  documentIds?: string[],
): string[] {
  const candidates = new Set(documentIds ?? entries.map((entry) => entry.documentId));
  return [...candidates].filter(
    (documentId) => decideDocumentAccess(entries, principal, documentId).allowed,
  );
}

export function listEffectiveReadableDocumentIds(
  defaults: KnowledgeBaseAclEntry[],
  exceptions: AclEntry[],
  principal: AccessPrincipal,
  documents: DocumentRef[],
): string[] {
  return documents
    .filter(
      (document) =>
        decideEffectiveDocumentAccess(
          defaults,
          exceptions,
          principal,
          document.id,
          document.knowledgeBaseId,
        ).allowed,
    )
    .map((document) => document.id);
}
