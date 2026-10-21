import type { AccessPrincipal, AclEntry, DocumentAccessDecision } from "./types.js";

function matchesPrincipal(entry: AclEntry, principal: AccessPrincipal): boolean {
  if (entry.subjectType === "user") {
    return entry.subjectId === principal.userId;
  }
  return principal.groupIds.includes(entry.subjectId);
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
    (entry) => entry.documentId === documentId && matchesPrincipal(entry, principal),
  );

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
