export type SeedRole = "member" | "knowledge_admin" | "security_admin" | "tenant_admin";
export type SeedUserStatus = "active" | "disabled";
export type SeedDocumentStatus = "pending" | "parsing" | "ready" | "failed" | "deleted";
export type SeedSubjectType = "user" | "group";
export type SeedPermission = "read" | "deny";
export type SeedDocumentAclMode = "inherit" | "restricted";

export interface SeedUser {
  id: string;
  name: string;
  email: string;
  role: SeedRole;
  departmentId: string | null;
  status: SeedUserStatus;
}

export interface SeedGroup {
  id: string;
  name: string;
  externalId: string;
}

export interface SeedAclSubject {
  type: SeedSubjectType;
  id: string;
}

export interface SeedAclException extends SeedAclSubject {
  permission: SeedPermission;
}

export interface SeedDocument {
  id: string;
  knowledgeBaseId: string;
  title: string;
  status: SeedDocumentStatus;
  sourceKey: string;
  ragflowDocumentId: string | null;
  aclMode?: SeedDocumentAclMode;
  exceptions: SeedAclException[];
  createdAt: string;
  updatedAt: string;
}

export interface SeedKnowledgeBase {
  id: string;
  name: string;
  description: string;
  embeddingModel: string;
  ownerId: string | null;
  ownerDepartmentId: string | null;
  ragflowDatasetId: string;
  defaultSubjects: SeedAclSubject[];
  documents: SeedDocument[];
  createdAt: string;
  updatedAt: string;
}

export const seedTenant = {
  id: "tenant-demo",
  name: "PiChat Demo",
  slug: "pichat-demo",
} as const;

export const seedPassword = "123456";

export const seedUsers: SeedUser[] = [
  {
    id: "u-zhang",
    name: "张明",
    email: "zhang.ming@example.com",
    role: "tenant_admin",
    departmentId: "g-platform",
    status: "active",
  },
  {
    id: "u-li",
    name: "李雷",
    email: "li.lei@example.com",
    role: "member",
    departmentId: "g-product",
    status: "active",
  },
  {
    id: "u-wang",
    name: "王芳",
    email: "wang.fang@example.com",
    role: "member",
    departmentId: "g-support",
    status: "active",
  },
  {
    id: "u-chen",
    name: "陈晨",
    email: "chen.chen@example.com",
    role: "knowledge_admin",
    departmentId: "g-product",
    status: "active",
  },
  {
    id: "u-liu",
    name: "刘洋",
    email: "liu.yang@example.com",
    role: "security_admin",
    departmentId: "g-platform",
    status: "active",
  },
  {
    id: "u-zhao",
    name: "赵敏",
    email: "zhao.min@example.com",
    role: "member",
    departmentId: "g-finance",
    status: "active",
  },
  {
    id: "u-sun",
    name: "孙悦",
    email: "sun.yue@example.com",
    role: "member",
    departmentId: "g-support",
    status: "active",
  },
  {
    id: "u-zhou",
    name: "周杰",
    email: "zhou.jie@example.com",
    role: "member",
    departmentId: "g-product",
    status: "active",
  },
  {
    id: "u-wu",
    name: "吴静",
    email: "wu.jing@example.com",
    role: "member",
    departmentId: "g-finance",
    status: "active",
  },
  {
    id: "u-zheng",
    name: "郑凯",
    email: "zheng.kai@example.com",
    role: "member",
    departmentId: "g-support",
    status: "active",
  },
  {
    id: "u-feng",
    name: "冯雪",
    email: "feng.xue@example.com",
    role: "member",
    departmentId: "g-product",
    status: "active",
  },
  {
    id: "u-he",
    name: "何伟",
    email: "he.wei@example.com",
    role: "member",
    departmentId: "g-platform",
    status: "active",
  },
  {
    id: "u-xu",
    name: "许琳",
    email: "xu.lin@example.com",
    role: "member",
    departmentId: "g-finance",
    status: "active",
  },
  {
    id: "u-gu",
    name: "顾强",
    email: "gu.qiang@example.com",
    role: "member",
    departmentId: "g-platform",
    status: "disabled",
  },
];

export const seedGroups: SeedGroup[] = [
  { id: "g-all", name: "综合部", externalId: "idp-all-staff" },
  { id: "g-platform", name: "平台部", externalId: "idp-platform" },
  { id: "g-product", name: "产品部", externalId: "idp-product" },
  { id: "g-support", name: "售后部", externalId: "idp-support" },
  { id: "g-finance", name: "财务部", externalId: "idp-finance" },
  { id: "g-outsource", name: "外包部", externalId: "idp-outsource" },
];

export const seedKnowledgeBases: SeedKnowledgeBase[] = [
  {
    id: "kb-policy",
    name: "内部制度",
    description: "公司级制度、流程与合规文件，默认多部门可读。",
    embeddingModel: "bge-m3 · 1024 维",
    ownerId: "u-zhang",
    ownerDepartmentId: "g-platform",
    ragflowDatasetId: "ragflow_policy_2026",
    createdAt: "2026-08-12T01:00:00.000Z",
    updatedAt: "2026-10-20T02:24:00.000Z",
    defaultSubjects: [
      { type: "group", id: "g-platform" },
      { type: "group", id: "g-product" },
      { type: "group", id: "g-support" },
      { type: "group", id: "g-finance" },
    ],
    documents: [
      {
        id: "doc-travel",
        knowledgeBaseId: "kb-policy",
        title: "差旅管理制度（2026 版）.pdf",
        status: "ready",
        sourceKey: "s3://policy/2026/travel-v2026.pdf",
        ragflowDocumentId: "rf_doc_travel",
        createdAt: "2026-08-12T01:00:00.000Z",
        updatedAt: "2026-10-20T02:24:00.000Z",
        exceptions: [{ type: "user", id: "u-wang", permission: "deny" }],
      },
      {
        id: "doc-expense",
        knowledgeBaseId: "kb-policy",
        title: "员工报销管理办法 v3.2.pdf",
        status: "ready",
        sourceKey: "s3://policy/2026/expense-v3.2.pdf",
        ragflowDocumentId: "rf_doc_expense",
        createdAt: "2026-08-12T01:00:00.000Z",
        updatedAt: "2026-10-20T01:12:00.000Z",
        exceptions: [{ type: "group", id: "g-outsource", permission: "deny" }],
      },
      {
        id: "doc-procurement",
        knowledgeBaseId: "kb-policy",
        title: "采购审批流程.pdf",
        status: "parsing",
        sourceKey: "s3://policy/2026/procurement.pdf",
        ragflowDocumentId: "rf_doc_procurement",
        createdAt: "2026-08-12T01:00:00.000Z",
        updatedAt: "2026-10-20T00:40:00.000Z",
        exceptions: [],
      },
      {
        id: "doc-security",
        knowledgeBaseId: "kb-policy",
        title: "信息安全管理制度.pdf",
        status: "ready",
        sourceKey: "s3://policy/2026/security.pdf",
        ragflowDocumentId: "rf_doc_security",
        aclMode: "restricted",
        createdAt: "2026-08-12T01:00:00.000Z",
        updatedAt: "2026-10-19T08:20:00.000Z",
        exceptions: [
          { type: "group", id: "g-platform", permission: "read" },
          { type: "group", id: "g-product", permission: "read" },
        ],
      },
      {
        id: "doc-onboarding",
        knowledgeBaseId: "kb-policy",
        title: "新员工入职手册.pdf",
        status: "ready",
        sourceKey: "s3://policy/hr/onboarding.pdf",
        ragflowDocumentId: "rf_doc_onboarding",
        createdAt: "2026-08-12T01:00:00.000Z",
        updatedAt: "2026-09-28T03:00:00.000Z",
        exceptions: [],
      },
    ],
  },
  {
    id: "kb-product",
    name: "产品手册",
    description: "对外产品资料与内部版本说明，默认产品部可读。",
    embeddingModel: "text-embedding-3-large · 3072 维",
    ownerId: "u-chen",
    ownerDepartmentId: "g-product",
    ragflowDatasetId: "ragflow_product_v3",
    createdAt: "2026-07-03T06:30:00.000Z",
    updatedAt: "2026-10-20T01:05:00.000Z",
    defaultSubjects: [{ type: "group", id: "g-product" }],
    documents: [
      {
        id: "doc-whitepaper",
        knowledgeBaseId: "kb-product",
        title: "产品白皮书 v3.pdf",
        status: "ready",
        sourceKey: "s3://product/whitepaper-v3.pdf",
        ragflowDocumentId: "rf_doc_whitepaper",
        createdAt: "2026-07-03T06:30:00.000Z",
        updatedAt: "2026-10-20T01:05:00.000Z",
        exceptions: [],
      },
      {
        id: "doc-api",
        knowledgeBaseId: "kb-product",
        title: "产品 API 使用指南.md",
        status: "ready",
        sourceKey: "s3://product/api-guide.md",
        ragflowDocumentId: "rf_doc_api",
        createdAt: "2026-07-03T06:30:00.000Z",
        updatedAt: "2026-10-18T07:40:00.000Z",
        exceptions: [],
      },
      {
        id: "doc-release",
        knowledgeBaseId: "kb-product",
        title: "版本发布说明 v3.2.docx",
        status: "parsing",
        sourceKey: "s3://product/release-v3.2.docx",
        ragflowDocumentId: "rf_doc_release",
        createdAt: "2026-07-03T06:30:00.000Z",
        updatedAt: "2026-10-19T23:55:00.000Z",
        exceptions: [],
      },
      {
        id: "doc-pricing",
        knowledgeBaseId: "kb-product",
        title: "定价与折扣策略.pdf",
        status: "ready",
        sourceKey: "s3://product/pricing.pdf",
        ragflowDocumentId: "rf_doc_pricing",
        aclMode: "restricted",
        createdAt: "2026-07-03T06:30:00.000Z",
        updatedAt: "2026-10-15T05:10:00.000Z",
        exceptions: [{ type: "group", id: "g-product", permission: "read" }],
      },
      {
        id: "doc-competitor",
        knowledgeBaseId: "kb-product",
        title: "竞品分析 2026 Q3.pdf",
        status: "failed",
        sourceKey: "s3://product/competitor-q3.pdf",
        ragflowDocumentId: "rf_doc_competitor",
        createdAt: "2026-07-03T06:30:00.000Z",
        updatedAt: "2026-10-14T10:30:00.000Z",
        exceptions: [],
      },
    ],
  },
  {
    id: "kb-support",
    name: "售后知识库",
    description: "客服与售后团队的处理规范、话术与常见问题。",
    embeddingModel: "bge-m3 · 1024 维",
    ownerId: "u-zhang",
    ownerDepartmentId: "g-support",
    ragflowDatasetId: "ragflow_support_2026",
    createdAt: "2026-06-18T02:00:00.000Z",
    updatedAt: "2026-10-19T09:42:00.000Z",
    defaultSubjects: [
      { type: "group", id: "g-support" },
      { type: "group", id: "g-product" },
    ],
    documents: [
      {
        id: "doc-complaint",
        knowledgeBaseId: "kb-support",
        title: "客户投诉处理 SOP.docx",
        status: "ready",
        sourceKey: "s3://support/complaint-sop.docx",
        ragflowDocumentId: "rf_doc_complaint",
        aclMode: "restricted",
        createdAt: "2026-06-18T02:00:00.000Z",
        updatedAt: "2026-10-19T09:42:00.000Z",
        exceptions: [{ type: "group", id: "g-support", permission: "read" }],
      },
      {
        id: "doc-return",
        knowledgeBaseId: "kb-support",
        title: "退换货政策.pdf",
        status: "ready",
        sourceKey: "s3://support/return-policy.pdf",
        ragflowDocumentId: "rf_doc_return",
        createdAt: "2026-06-18T02:00:00.000Z",
        updatedAt: "2026-10-12T02:20:00.000Z",
        exceptions: [],
      },
      {
        id: "doc-sla",
        knowledgeBaseId: "kb-support",
        title: "售后服务等级说明.pdf",
        status: "ready",
        sourceKey: "s3://support/sla.pdf",
        ragflowDocumentId: "rf_doc_sla",
        createdAt: "2026-06-18T02:00:00.000Z",
        updatedAt: "2026-10-09T06:00:00.000Z",
        exceptions: [{ type: "group", id: "g-outsource", permission: "deny" }],
      },
      {
        id: "doc-faq",
        knowledgeBaseId: "kb-support",
        title: "常见问题汇总.md",
        status: "ready",
        sourceKey: "s3://support/faq.md",
        ragflowDocumentId: "rf_doc_faq",
        createdAt: "2026-06-18T02:00:00.000Z",
        updatedAt: "2026-10-06T01:30:00.000Z",
        exceptions: [],
      },
      {
        id: "doc-ticket",
        knowledgeBaseId: "kb-support",
        title: "工单规范与升级路径.pdf",
        status: "ready",
        sourceKey: "s3://support/ticket.pdf",
        ragflowDocumentId: "rf_doc_ticket",
        createdAt: "2026-06-18T02:00:00.000Z",
        updatedAt: "2026-09-30T08:10:00.000Z",
        exceptions: [],
      },
    ],
  },
  {
    id: "kb-board",
    name: "董事会材料",
    description: "仅在明确授权后可读，默认不对普通成员开放。",
    embeddingModel: "bge-m3 · 1024 维",
    ownerId: "u-zhang",
    ownerDepartmentId: "g-finance",
    ragflowDatasetId: "ragflow_board_2026",
    createdAt: "2026-09-01T01:00:00.000Z",
    updatedAt: "2026-09-30T10:00:00.000Z",
    defaultSubjects: [{ type: "group", id: "g-finance" }],
    documents: [
      {
        id: "doc-board-minutes",
        knowledgeBaseId: "kb-board",
        title: "2026 Q3 董事会纪要.pdf",
        status: "ready",
        sourceKey: "s3://board/2026-q3-minutes.pdf",
        ragflowDocumentId: "rf_doc_board_minutes",
        createdAt: "2026-09-01T01:00:00.000Z",
        updatedAt: "2026-09-30T10:00:00.000Z",
        exceptions: [],
      },
    ],
  },
];

export const seedDocuments = seedKnowledgeBases.flatMap((knowledgeBase) =>
  knowledgeBase.documents.map((document) => ({
    ...document,
    knowledgeBaseName: knowledgeBase.name,
  })),
);
