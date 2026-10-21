export type SubjectType = "user" | "group";

export type AclPermission = "read" | "deny";

export interface AclEntry {
  tenantId?: string;
  documentId: string;
  knowledgeBaseId: string;
  subjectType: SubjectType;
  subjectId: string;
  permission: AclPermission;
}

export interface KnowledgeBaseAclEntry {
  tenantId?: string;
  knowledgeBaseId: string;
  subjectType: SubjectType;
  subjectId: string;
  permission: AclPermission;
}

export interface DocumentRef {
  id: string;
  knowledgeBaseId: string;
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
