export type SubjectType = "user" | "group";

export type AclPermission = "read" | "deny";

export interface AclEntry {
  documentId: string;
  knowledgeBaseId: string;
  subjectType: SubjectType;
  subjectId: string;
  permission: AclPermission;
}

export interface AccessPrincipal {
  tenantId: string;
  userId: string;
  groupIds: string[];
  role: string;
}

export interface DocumentAccessDecision {
  allowed: boolean;
  reason: "allowed" | "explicit_deny" | "no_grant" | "role_override";
}
