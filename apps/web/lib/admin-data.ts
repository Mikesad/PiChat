import { type AclEntry, decideDocumentAccess } from "@pichat/access-control";

export type UserRole = "member" | "knowledge_admin" | "security_admin" | "tenant_admin";
export type DocumentStatus = "pending" | "parsing" | "ready" | "failed" | "deleted";
export type AclPermission = "read" | "deny";
export type SubjectType = "user" | "group";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  groupIds: string[];
  status: "active" | "disabled";
}

export interface AdminGroup {
  id: string;
  name: string;
  externalId: string;
}

export interface AclSubject {
  type: SubjectType;
  id: string;
}

export interface AclException extends AclSubject {
  permission: AclPermission;
}

export interface AdminDocument {
  id: string;
  knowledgeBaseId: string;
  title: string;
  status: DocumentStatus;
  sizeLabel: string | null;
  updatedAt: string;
  updatedLabel: string;
  createdAt: string;
  sourceKey: string;
  ragflowDocumentId?: string | null;
  mimeType?: string | null;
  errorMessage?: string | null;
  exceptions: AclException[];
  effectiveReaderCount: number;
  canManageAcl: boolean;
}

export interface AdminKnowledgeBase {
  id: string;
  name: string;
  description: string;
  embeddingModel: string;
  ragflowDatasetId: string;
  aclVersion: number;
  createdAt: string;
  updatedAt: string;
  updatedLabel: string;
  defaultSubjects: AclSubject[];
  documentCount: number;
  readableDocumentCount: number;
  canManageAcl: boolean;
  documents: AdminDocument[];
}

export const mockCurrentUser: AdminUser = {
  id: "u-zhang",
  name: "张明",
  email: "zhang.ming@example.com",
  role: "tenant_admin",
  groupIds: ["g-all", "g-platform"],
  status: "active",
};

export const users: AdminUser[] = [
  mockCurrentUser,
  {
    id: "u-li",
    name: "李雷",
    email: "li.lei@example.com",
    role: "member",
    groupIds: ["g-all", "g-product", "g-finance"],
    status: "active",
  },
  {
    id: "u-wang",
    name: "王芳",
    email: "wang.fang@example.com",
    role: "member",
    groupIds: ["g-all", "g-support"],
    status: "active",
  },
  {
    id: "u-chen",
    name: "陈晨",
    email: "chen.chen@example.com",
    role: "knowledge_admin",
    groupIds: ["g-all", "g-product"],
    status: "active",
  },
  {
    id: "u-liu",
    name: "刘洋",
    email: "liu.yang@example.com",
    role: "security_admin",
    groupIds: ["g-all", "g-platform"],
    status: "active",
  },
  {
    id: "u-zhao",
    name: "赵敏",
    email: "zhao.min@example.com",
    role: "member",
    groupIds: ["g-all", "g-finance"],
    status: "active",
  },
  {
    id: "u-sun",
    name: "孙悦",
    email: "sun.yue@example.com",
    role: "member",
    groupIds: ["g-all", "g-support"],
    status: "active",
  },
  {
    id: "u-zhou",
    name: "周杰",
    email: "zhou.jie@example.com",
    role: "member",
    groupIds: ["g-all", "g-product"],
    status: "active",
  },
  {
    id: "u-wu",
    name: "吴静",
    email: "wu.jing@example.com",
    role: "member",
    groupIds: ["g-all", "g-finance"],
    status: "active",
  },
  {
    id: "u-zheng",
    name: "郑凯",
    email: "zheng.kai@example.com",
    role: "member",
    groupIds: ["g-all", "g-support"],
    status: "active",
  },
  {
    id: "u-feng",
    name: "冯雪",
    email: "feng.xue@example.com",
    role: "member",
    groupIds: ["g-all", "g-product"],
    status: "active",
  },
  {
    id: "u-he",
    name: "何伟",
    email: "he.wei@example.com",
    role: "member",
    groupIds: ["g-all"],
    status: "active",
  },
  {
    id: "u-xu",
    name: "许琳",
    email: "xu.lin@example.com",
    role: "member",
    groupIds: ["g-all", "g-finance"],
    status: "active",
  },
  {
    id: "u-gu",
    name: "顾强",
    email: "gu.qiang@example.com",
    role: "member",
    groupIds: ["g-all"],
    status: "disabled",
  },
];

export const groups: AdminGroup[] = [
  { id: "g-all", name: "全员", externalId: "idp-all-staff" },
  { id: "g-platform", name: "平台组", externalId: "idp-platform" },
  { id: "g-product", name: "产品组", externalId: "idp-product" },
  { id: "g-support", name: "售后组", externalId: "idp-support" },
  { id: "g-finance", name: "财务组", externalId: "idp-finance" },
  { id: "g-outsource", name: "外包组", externalId: "idp-outsource" },
];

export const roleLabels: Record<UserRole, string> = {
  member: "成员",
  knowledge_admin: "知识库管理员",
  security_admin: "安全管理员",
  tenant_admin: "租户管理员",
};

export const statusMeta: Record<
  DocumentStatus,
  { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" }
> = {
  pending: { label: "排队中", tone: "neutral" },
  parsing: { label: "解析中", tone: "warning" },
  ready: { label: "可检索", tone: "success" },
  failed: { label: "解析失败", tone: "danger" },
  deleted: { label: "已删除", tone: "neutral" },
};

export function formatUpdatedLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((todayStart - dateStart) / 86_400_000);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  if (dayDiff === 0) {
    return `今天 ${time}`;
  }
  if (dayDiff === 1) {
    return `昨天 ${time}`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function doc(
  knowledgeBaseId: string,
  input: Omit<
    AdminDocument,
    "knowledgeBaseId" | "exceptions" | "createdAt" | "effectiveReaderCount" | "canManageAcl"
  > & {
    exceptions?: AclException[];
    createdAt?: string;
    effectiveReaderCount?: number;
    canManageAcl?: boolean;
  },
): AdminDocument {
  return {
    knowledgeBaseId,
    ...input,
    exceptions: input.exceptions ?? [],
    createdAt: input.createdAt ?? input.updatedAt,
    effectiveReaderCount: input.effectiveReaderCount ?? 0,
    canManageAcl: input.canManageAcl ?? true,
  };
}

export const seedKnowledgeBases: AdminKnowledgeBase[] = [
  {
    id: "kb-policy",
    name: "内部制度",
    description: "公司级制度、流程与合规文件，默认全员可读。",
    embeddingModel: "bge-m3 · 1024 维",
    ragflowDatasetId: "ragflow_policy_2026",
    aclVersion: 1,
    documentCount: 5,
    readableDocumentCount: 4,
    canManageAcl: true,
    createdAt: "2026-08-12T09:00:00+08:00",
    updatedAt: "2026-10-20T10:24:00+08:00",
    updatedLabel: "今天 10:24",
    defaultSubjects: [{ type: "group", id: "g-all" }],
    documents: [
      doc("kb-policy", {
        id: "doc-travel",
        title: "差旅管理制度（2026 版）.pdf",
        status: "ready",
        sizeLabel: "1.8 MB",
        updatedAt: "2026-10-20T10:24:00+08:00",
        updatedLabel: "今天 10:24",
        sourceKey: "s3://policy/2026/travel-v2026.pdf",
        ragflowDocumentId: "rf_doc_travel",
        exceptions: [{ type: "user", id: "u-wang", permission: "deny" }],
      }),
      doc("kb-policy", {
        id: "doc-expense",
        title: "员工报销管理办法 v3.2.pdf",
        status: "ready",
        sizeLabel: "2.4 MB",
        updatedAt: "2026-10-20T09:12:00+08:00",
        updatedLabel: "今天 09:12",
        sourceKey: "s3://policy/2026/expense-v3.2.pdf",
        ragflowDocumentId: "rf_doc_expense",
        exceptions: [{ type: "group", id: "g-outsource", permission: "deny" }],
      }),
      doc("kb-policy", {
        id: "doc-procurement",
        title: "采购审批流程.pdf",
        status: "parsing",
        sizeLabel: "860 KB",
        updatedAt: "2026-10-20T08:40:00+08:00",
        updatedLabel: "今天 08:40",
        sourceKey: "s3://policy/2026/procurement.pdf",
        ragflowDocumentId: "rf_doc_procurement",
      }),
      doc("kb-policy", {
        id: "doc-security",
        title: "信息安全管理制度.pdf",
        status: "ready",
        sizeLabel: "1.2 MB",
        updatedAt: "2026-10-19T16:20:00+08:00",
        updatedLabel: "昨天 16:20",
        sourceKey: "s3://policy/2026/security.pdf",
        ragflowDocumentId: "rf_doc_security",
        exceptions: [
          { type: "user", id: "u-li", permission: "deny" },
          { type: "user", id: "u-wang", permission: "deny" },
        ],
      }),
      doc("kb-policy", {
        id: "doc-onboarding",
        title: "新员工入职手册.pdf",
        status: "ready",
        sizeLabel: "3.1 MB",
        updatedAt: "2026-09-28T11:00:00+08:00",
        updatedLabel: "9月28日",
        sourceKey: "s3://policy/hr/onboarding.pdf",
        ragflowDocumentId: "rf_doc_onboarding",
      }),
    ],
  },
  {
    id: "kb-product",
    name: "产品手册",
    description: "对外产品资料与内部版本说明，默认产品组可读。",
    embeddingModel: "text-embedding-3-large · 3072 维",
    ragflowDatasetId: "ragflow_product_v3",
    aclVersion: 1,
    documentCount: 5,
    readableDocumentCount: 4,
    canManageAcl: true,
    createdAt: "2026-07-03T14:30:00+08:00",
    updatedAt: "2026-10-20T09:05:00+08:00",
    updatedLabel: "今天 09:05",
    defaultSubjects: [{ type: "group", id: "g-product" }],
    documents: [
      doc("kb-product", {
        id: "doc-whitepaper",
        title: "产品白皮书 v3.pdf",
        status: "ready",
        sizeLabel: "5.6 MB",
        updatedAt: "2026-10-20T09:05:00+08:00",
        updatedLabel: "今天 09:05",
        sourceKey: "s3://product/whitepaper-v3.pdf",
        ragflowDocumentId: "rf_doc_whitepaper",
      }),
      doc("kb-product", {
        id: "doc-api",
        title: "产品 API 使用指南.md",
        status: "ready",
        sizeLabel: "128 KB",
        updatedAt: "2026-10-18T15:40:00+08:00",
        updatedLabel: "10月18日",
        sourceKey: "s3://product/api-guide.md",
        ragflowDocumentId: "rf_doc_api",
      }),
      doc("kb-product", {
        id: "doc-release",
        title: "版本发布说明 v3.2.docx",
        status: "parsing",
        sizeLabel: "640 KB",
        updatedAt: "2026-10-20T07:55:00+08:00",
        updatedLabel: "今天 07:55",
        sourceKey: "s3://product/release-v3.2.docx",
        ragflowDocumentId: "rf_doc_release",
      }),
      doc("kb-product", {
        id: "doc-pricing",
        title: "定价与折扣策略.pdf",
        status: "ready",
        sizeLabel: "920 KB",
        updatedAt: "2026-10-15T13:10:00+08:00",
        updatedLabel: "10月15日",
        sourceKey: "s3://product/pricing.pdf",
        ragflowDocumentId: "rf_doc_pricing",
        exceptions: [{ type: "group", id: "g-finance", permission: "read" }],
      }),
      doc("kb-product", {
        id: "doc-competitor",
        title: "竞品分析 2026 Q3.pdf",
        status: "failed",
        sizeLabel: "4.2 MB",
        updatedAt: "2026-10-14T18:30:00+08:00",
        updatedLabel: "10月14日",
        sourceKey: "s3://product/competitor-q3.pdf",
        ragflowDocumentId: "rf_doc_competitor",
      }),
    ],
  },
  {
    id: "kb-support",
    name: "售后知识库",
    description: "客服与售后团队的处理规范、话术与常见问题。",
    embeddingModel: "bge-m3 · 1024 维",
    ragflowDatasetId: "ragflow_support_2026",
    aclVersion: 1,
    documentCount: 5,
    readableDocumentCount: 5,
    canManageAcl: true,
    createdAt: "2026-06-18T10:00:00+08:00",
    updatedAt: "2026-10-19T17:42:00+08:00",
    updatedLabel: "昨天 17:42",
    defaultSubjects: [{ type: "group", id: "g-support" }],
    documents: [
      doc("kb-support", {
        id: "doc-complaint",
        title: "客户投诉处理 SOP.docx",
        status: "ready",
        sizeLabel: "1.1 MB",
        updatedAt: "2026-10-19T17:42:00+08:00",
        updatedLabel: "昨天 17:42",
        sourceKey: "s3://support/complaint-sop.docx",
        ragflowDocumentId: "rf_doc_complaint",
        exceptions: [{ type: "group", id: "g-product", permission: "read" }],
      }),
      doc("kb-support", {
        id: "doc-return",
        title: "退换货政策.pdf",
        status: "ready",
        sizeLabel: "760 KB",
        updatedAt: "2026-10-12T10:20:00+08:00",
        updatedLabel: "10月12日",
        sourceKey: "s3://support/return-policy.pdf",
        ragflowDocumentId: "rf_doc_return",
      }),
      doc("kb-support", {
        id: "doc-sla",
        title: "售后服务等级说明.pdf",
        status: "ready",
        sizeLabel: "880 KB",
        updatedAt: "2026-10-09T14:00:00+08:00",
        updatedLabel: "10月9日",
        sourceKey: "s3://support/sla.pdf",
        ragflowDocumentId: "rf_doc_sla",
        exceptions: [{ type: "group", id: "g-outsource", permission: "deny" }],
      }),
      doc("kb-support", {
        id: "doc-faq",
        title: "常见问题汇总.md",
        status: "ready",
        sizeLabel: "96 KB",
        updatedAt: "2026-10-06T09:30:00+08:00",
        updatedLabel: "10月6日",
        sourceKey: "s3://support/faq.md",
        ragflowDocumentId: "rf_doc_faq",
      }),
      doc("kb-support", {
        id: "doc-ticket",
        title: "工单规范与升级路径.pdf",
        status: "ready",
        sizeLabel: "540 KB",
        updatedAt: "2026-09-30T16:10:00+08:00",
        updatedLabel: "9月30日",
        sourceKey: "s3://support/ticket.pdf",
        ragflowDocumentId: "rf_doc_ticket",
      }),
    ],
  },
  {
    id: "kb-board",
    name: "董事会材料",
    description: "仅在明确授权后可读，默认不对普通成员开放。",
    embeddingModel: "bge-m3 · 1024 维",
    ragflowDatasetId: "ragflow_board_2026",
    aclVersion: 1,
    documentCount: 1,
    readableDocumentCount: 1,
    canManageAcl: true,
    createdAt: "2026-09-01T09:00:00+08:00",
    updatedAt: "2026-09-30T18:00:00+08:00",
    updatedLabel: "9月30日",
    defaultSubjects: [],
    documents: [
      doc("kb-board", {
        id: "doc-board-minutes",
        title: "2026 Q3 董事会纪要.pdf",
        status: "ready",
        sizeLabel: "1.4 MB",
        updatedAt: "2026-09-30T18:00:00+08:00",
        updatedLabel: "9月30日",
        sourceKey: "s3://board/2026-q3-minutes.pdf",
        ragflowDocumentId: "rf_doc_board_minutes",
      }),
    ],
  },
];

export const seedDocuments = seedKnowledgeBases.flatMap((knowledgeBase) =>
  knowledgeBase.documents.map((document) => ({
    ...document,
    knowledgeBaseName: knowledgeBase.name,
  })),
);

export function findKnowledgeBase(knowledgeBases: AdminKnowledgeBase[], knowledgeBaseId: string) {
  return knowledgeBases.find((knowledgeBase) => knowledgeBase.id === knowledgeBaseId);
}

export function findDocument(knowledgeBases: AdminKnowledgeBase[], documentId: string) {
  for (const knowledgeBase of knowledgeBases) {
    const document = knowledgeBase.documents.find((item) => item.id === documentId);
    if (document) {
      return { knowledgeBase, document };
    }
  }
  return undefined;
}

export function findUser(userId: string) {
  return users.find((user) => user.id === userId);
}

export function findGroup(groupId: string) {
  return groups.find((group) => group.id === groupId);
}

export function groupMemberCount(groupId: string) {
  return users.filter((user) => user.status === "active" && user.groupIds.includes(groupId)).length;
}

export function subjectName(subject: AclSubject) {
  if (subject.type === "user") {
    return findUser(subject.id)?.name ?? "未知用户";
  }
  return findGroup(subject.id)?.name ?? "未知用户组";
}

export function subjectMemberCount(subject: AclSubject) {
  if (subject.type === "user") {
    return 1;
  }
  return groupMemberCount(subject.id);
}

export function subjectKey(subject: AclSubject) {
  return `${subject.type}:${subject.id}`;
}

export function subjectOptionLabel(subject: AclSubject) {
  const count = subjectMemberCount(subject);
  return subject.type === "user"
    ? `${subjectName(subject)} · 用户`
    : `${subjectName(subject)} · ${count} 人`;
}

export function matchesSubject(subject: AclSubject, user: AdminUser) {
  return subject.type === "user" ? subject.id === user.id : user.groupIds.includes(subject.id);
}

export function toPrincipal(user: AdminUser) {
  return {
    tenantId: "tenant-demo",
    userId: user.id,
    groupIds: user.groupIds,
    role: user.role,
  };
}

export function effectiveAclEntries(
  knowledgeBase: AdminKnowledgeBase,
  document: AdminDocument,
  exceptions: AclException[] = document.exceptions,
): AclEntry[] {
  return [
    ...knowledgeBase.defaultSubjects.map((subject) => ({
      documentId: document.id,
      knowledgeBaseId: knowledgeBase.id,
      subjectType: subject.type,
      subjectId: subject.id,
      permission: "read" as const,
    })),
    ...exceptions.map((exception) => ({
      documentId: document.id,
      knowledgeBaseId: knowledgeBase.id,
      subjectType: exception.type,
      subjectId: exception.id,
      permission: exception.permission,
    })),
  ];
}

export function effectiveUsersFor(
  knowledgeBase: AdminKnowledgeBase,
  document: AdminDocument,
  exceptions: AclException[],
  includeAdmins = false,
) {
  const entries = effectiveAclEntries(knowledgeBase, document, exceptions);
  return users.filter((user) => {
    if (!includeAdmins && user.role === "tenant_admin") {
      return false;
    }
    if (user.status !== "active") {
      return false;
    }
    return decideDocumentAccess(entries, toPrincipal(user), document.id).allowed;
  });
}

export function effectiveUsers(
  knowledgeBase: AdminKnowledgeBase,
  document: AdminDocument,
  includeAdmins = false,
) {
  return effectiveUsersFor(knowledgeBase, document, document.exceptions, includeAdmins);
}

export interface AccessExplanation {
  allowed: boolean;
  reason: "allowed" | "explicit_deny" | "no_grant" | "role_override";
  source?: "knowledge_base" | "document_exception";
  subject?: AclSubject;
}

export function explainAccessFor(
  knowledgeBase: AdminKnowledgeBase,
  document: AdminDocument,
  user: AdminUser,
  exceptions: AclException[],
): AccessExplanation {
  const entries = effectiveAclEntries(knowledgeBase, document, exceptions);
  const decision = decideDocumentAccess(entries, toPrincipal(user), document.id);

  if (decision.reason === "role_override") {
    return { allowed: true, reason: "role_override" };
  }

  const matchingDeny = exceptions.find(
    (exception) => exception.permission === "deny" && matchesSubject(exception, user),
  );

  if (decision.reason === "explicit_deny") {
    return {
      allowed: false,
      reason: "explicit_deny",
      source: "document_exception",
      subject: matchingDeny,
    };
  }

  if (decision.reason === "allowed") {
    const documentRead = exceptions.find(
      (exception) => exception.permission === "read" && matchesSubject(exception, user),
    );
    if (documentRead) {
      return {
        allowed: true,
        reason: "allowed",
        source: "document_exception",
        subject: documentRead,
      };
    }
    const defaultSubject = knowledgeBase.defaultSubjects.find((subject) =>
      matchesSubject(subject, user),
    );
    return {
      allowed: true,
      reason: "allowed",
      source: "knowledge_base",
      subject: defaultSubject,
    };
  }

  return { allowed: false, reason: "no_grant" };
}

export function explainAccess(
  knowledgeBase: AdminKnowledgeBase,
  document: AdminDocument,
  user: AdminUser,
) {
  return explainAccessFor(knowledgeBase, document, user, document.exceptions);
}

export function accessCountsFor(
  knowledgeBase: AdminKnowledgeBase,
  document: AdminDocument,
  exceptions: AclException[],
) {
  const allowed = effectiveUsersFor(knowledgeBase, document, exceptions);
  const denied = users.filter((user) => {
    if (user.role === "tenant_admin" || user.status !== "active") {
      return false;
    }
    return explainAccessFor(knowledgeBase, document, user, exceptions).reason === "explicit_deny";
  });
  return {
    allowed,
    denied,
    exceptionCount: exceptions.length,
    denyCount: exceptions.filter((exception) => exception.permission === "deny").length,
  };
}

export function documentAccessCounts(knowledgeBase: AdminKnowledgeBase, document: AdminDocument) {
  return accessCountsFor(knowledgeBase, document, document.exceptions);
}

export function documentStats(knowledgeBase: AdminKnowledgeBase) {
  const documents = knowledgeBase.documents.filter((document) => document.status !== "deleted");
  return {
    total: documents.length,
    ready: documents.filter((document) => document.status === "ready").length,
    parsing: documents.filter((document) => document.status === "parsing").length,
    failed: documents.filter((document) => document.status === "failed").length,
    withExceptions: documents.filter((document) => document.exceptions.length > 0).length,
  };
}

export function mergeException(exceptions: AclException[], next: AclException) {
  const filtered = exceptions.filter((exception) => subjectKey(exception) !== subjectKey(next));
  return [...filtered, next];
}

export function removeException(exceptions: AclException[], subject: AclSubject) {
  return exceptions.filter((exception) => subjectKey(exception) !== subjectKey(subject));
}

export function defaultAccessLabel(knowledgeBase: AdminKnowledgeBase) {
  if (knowledgeBase.defaultSubjects.length === 0) {
    return "未设置默认范围";
  }
  return knowledgeBase.defaultSubjects.map((subject) => subjectName(subject)).join("、");
}

export function sortDocuments(
  documents: AdminDocument[],
  sortKey: "title" | "updated" | "access",
  direction: "asc" | "desc",
  knowledgeBases: AdminKnowledgeBase[],
) {
  const sorted = [...documents].sort((left, right) => {
    if (sortKey === "title") {
      return left.title.localeCompare(right.title, "zh-CN");
    }
    if (sortKey === "updated") {
      return left.updatedAt.localeCompare(right.updatedAt);
    }
    const foundLeft = findDocument(knowledgeBases, left.id);
    const foundRight = findDocument(knowledgeBases, right.id);
    const leftCount = foundLeft
      ? effectiveUsers(foundLeft.knowledgeBase, foundLeft.document).length
      : 0;
    const rightCount = foundRight
      ? effectiveUsers(foundRight.knowledgeBase, foundRight.document).length
      : 0;
    return leftCount - rightCount;
  });
  return direction === "asc" ? sorted : sorted.reverse();
}

export type AuditAction =
  | "knowledge_base.create"
  | "knowledge_base.update"
  | "knowledge_base.delete"
  | "knowledge_base.default_access.update"
  | "document.upload"
  | "document.delete"
  | "document.reparse"
  | "document.acl.update";

export type AuditResult = "success" | "denied" | "failed";

export interface AuditLogEntry {
  id: string;
  at: string;
  atLabel: string;
  actorId: string;
  action: AuditAction;
  resourceType: "knowledge_base" | "document" | "acl" | "member" | "session";
  resourceId: string;
  resourceLabel: string;
  result: AuditResult;
  summary: string;
  metadata: Array<{ label: string; value: string }>;
}

export const auditActionLabels: Record<AuditAction, string> = {
  "knowledge_base.create": "创建知识库",
  "knowledge_base.update": "更新知识库",
  "knowledge_base.delete": "删除知识库",
  "knowledge_base.default_access.update": "更新默认访问范围",
  "document.upload": "上传文档",
  "document.delete": "删除文档",
  "document.reparse": "重新解析文档",
  "document.acl.update": "更新文档权限",
};

export const auditResourceLabels: Record<AuditLogEntry["resourceType"], string> = {
  knowledge_base: "知识库",
  document: "文档",
  acl: "权限规则",
  member: "成员",
  session: "会话",
};

export const auditResultLabels: Record<AuditResult, string> = {
  success: "成功",
  denied: "拒绝",
  failed: "失败",
};

export const lastActiveLabels: Record<string, string> = {
  "u-zhang": "今天 09:40",
  "u-li": "今天 09:12",
  "u-wang": "昨天 17:42",
  "u-chen": "今天 08:55",
  "u-liu": "今天 08:30",
  "u-zhao": "昨天 16:20",
  "u-sun": "昨天 15:02",
  "u-zhou": "10月19日",
  "u-wu": "10月19日",
  "u-zheng": "10月18日",
  "u-feng": "10月18日",
  "u-he": "10月17日",
  "u-xu": "10月17日",
  "u-gu": "—",
};

export const seedAuditLogs: AuditLogEntry[] = [
  {
    id: "audit-1",
    at: "2026-10-20T10:24:00+08:00",
    atLabel: "今天 10:24",
    actorId: "u-zhang",
    action: "document.acl.update",
    resourceType: "document",
    resourceId: "doc-travel",
    resourceLabel: "差旅管理制度（2026 版）.pdf",
    result: "success",
    summary: "更新文档权限：新增拒绝 1 条",
    metadata: [
      { label: "新增", value: "拒绝 · 王芳" },
      { label: "生效范围", value: "下一次提问" },
    ],
  },
  {
    id: "audit-2",
    at: "2026-10-20T09:40:00+08:00",
    atLabel: "今天 09:40",
    actorId: "u-zhang",
    action: "knowledge_base.default_access.update",
    resourceType: "knowledge_base",
    resourceId: "kb-policy",
    resourceLabel: "内部制度",
    result: "success",
    summary: "更新默认访问范围：全员",
    metadata: [
      { label: "默认范围", value: "全员" },
      { label: "生效范围", value: "下一次提问" },
    ],
  },
  {
    id: "audit-3",
    at: "2026-10-20T09:12:00+08:00",
    atLabel: "今天 09:12",
    actorId: "u-chen",
    action: "document.upload",
    resourceType: "document",
    resourceId: "doc-expense",
    resourceLabel: "员工报销管理办法 v3.2.pdf",
    result: "success",
    summary: "上传文档并加入解析队列",
    metadata: [
      { label: "知识库", value: "内部制度" },
      { label: "大小", value: "2.4 MB" },
    ],
  },
  {
    id: "audit-4",
    at: "2026-10-19T17:42:00+08:00",
    atLabel: "昨天 17:42",
    actorId: "u-liu",
    action: "document.acl.update",
    resourceType: "document",
    resourceId: "doc-security",
    resourceLabel: "信息安全管理制度.pdf",
    result: "success",
    summary: "新增 2 条拒绝规则",
    metadata: [
      { label: "新增", value: "李雷、王芳" },
      { label: "规则", value: "拒绝" },
    ],
  },
  {
    id: "audit-5",
    at: "2026-10-19T16:05:00+08:00",
    atLabel: "昨天 16:05",
    actorId: "u-wang",
    action: "document.acl.update",
    resourceType: "document",
    resourceId: "doc-travel",
    resourceLabel: "差旅管理制度（2026 版）.pdf",
    result: "denied",
    summary: "缺少知识库管理员权限，操作被拒绝",
    metadata: [
      { label: "原因", value: "无 knowledge_admin 角色" },
      { label: "请求", value: "移除王芳的拒绝规则" },
    ],
  },
  {
    id: "audit-6",
    at: "2026-10-19T15:02:00+08:00",
    atLabel: "昨天 15:02",
    actorId: "u-chen",
    action: "document.reparse",
    resourceType: "document",
    resourceId: "doc-competitor",
    resourceLabel: "竞品分析 2026 Q3.pdf",
    result: "failed",
    summary: "重新解析失败：RAGFlow 返回解析错误",
    metadata: [{ label: "错误码", value: "parse_failed" }],
  },
  {
    id: "audit-7",
    at: "2026-10-19T11:30:00+08:00",
    atLabel: "10月19日 11:30",
    actorId: "u-zhang",
    action: "knowledge_base.create",
    resourceType: "knowledge_base",
    resourceId: "kb-board",
    resourceLabel: "董事会材料",
    result: "success",
    summary: "创建知识库，未设置默认访问范围",
    metadata: [
      { label: "Embedding", value: "bge-m3 · 1024 维" },
      { label: "默认范围", value: "未设置" },
    ],
  },
  {
    id: "audit-8",
    at: "2026-10-18T09:15:00+08:00",
    atLabel: "10月18日 09:15",
    actorId: "u-liu",
    action: "document.delete",
    resourceType: "document",
    resourceId: "doc-travel-2025",
    resourceLabel: "差旅管理制度（2025 版）.pdf",
    result: "success",
    summary: "删除过期文档",
    metadata: [{ label: "知识库", value: "内部制度" }],
  },
  {
    id: "audit-9",
    at: "2026-10-17T17:45:00+08:00",
    atLabel: "10月17日 17:45",
    actorId: "u-zhang",
    action: "knowledge_base.update",
    resourceType: "knowledge_base",
    resourceId: "kb-product",
    resourceLabel: "产品手册",
    result: "success",
    summary: "更新知识库描述",
    metadata: [{ label: "字段", value: "描述" }],
  },
  {
    id: "audit-10",
    at: "2026-10-17T14:20:00+08:00",
    atLabel: "10月17日 14:20",
    actorId: "u-zhang",
    action: "document.acl.update",
    resourceType: "document",
    resourceId: "doc-complaint",
    resourceLabel: "客户投诉处理 SOP.docx",
    result: "success",
    summary: "新增读取例外：产品组",
    metadata: [{ label: "新增", value: "读取 · 产品组" }],
  },
];

export function readableDocumentsFor(user: AdminUser, knowledgeBases: AdminKnowledgeBase[]) {
  const principal = toPrincipal(user);
  return knowledgeBases.flatMap((knowledgeBase) =>
    knowledgeBase.documents
      .filter((document) => document.status !== "deleted")
      .filter(
        (document) =>
          decideDocumentAccess(effectiveAclEntries(knowledgeBase, document), principal, document.id)
            .allowed,
      ),
  );
}

export function totalDocuments(knowledgeBases: AdminKnowledgeBase[]) {
  return knowledgeBases.reduce(
    (sum, knowledgeBase) =>
      sum + knowledgeBase.documents.filter((document) => document.status !== "deleted").length,
    0,
  );
}

export function activeGroupMembers(groupId: string) {
  return users.filter((user) => user.status === "active" && user.groupIds.includes(groupId));
}
