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
  return principal.departmentId !== null && entry.subjectId === principal.departmentId;
}

function belongsToTenant(entry: { tenantId?: string }, principal: AccessPrincipal): boolean {
  return entry.tenantId === undefined || entry.tenantId === principal.tenantId;
}

export function decideKnowledgeBaseAccess(
  defaults: KnowledgeBaseAclEntry[],
  principal: AccessPrincipal,
  knowledgeBaseId: string,
): DocumentAccessDecision {
  if (principal.role === "tenant_admin") {
    return { allowed: true, reason: "role_override" };
  }

  const relevant = defaults.filter(
    (entry) =>
      entry.knowledgeBaseId === knowledgeBaseId &&
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
  document: DocumentRef,
): DocumentAccessDecision {
  if (principal.role === "tenant_admin") {
    return { allowed: true, reason: "role_override" };
  }

  const knowledgeBaseDecision = decideKnowledgeBaseAccess(
    defaults,
    principal,
    document.knowledgeBaseId,
  );
  if (!knowledgeBaseDecision.allowed) {
    return knowledgeBaseDecision;
  }

  const relevantExceptions = exceptions.filter(
    (entry) =>
      entry.documentId === document.id &&
      entry.knowledgeBaseId === document.knowledgeBaseId &&
      belongsToTenant(entry, principal) &&
      matchesPrincipal(entry, principal),
  );

  if (relevantExceptions.some((entry) => entry.permission === "deny")) {
    return { allowed: false, reason: "explicit_deny" };
  }

  if (document.aclMode === "restricted") {
    return relevantExceptions.some((entry) => entry.permission === "read")
      ? { allowed: true, reason: "allowed" }
      : { allowed: false, reason: "no_grant" };
  }

  if (document.aclMode !== "inherit") {
    return { allowed: false, reason: "no_grant" };
  }

  return { allowed: true, reason: "allowed" };
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
        decideEffectiveDocumentAccess(defaults, exceptions, principal, document).allowed,
    )
    .map((document) => document.id);
}
