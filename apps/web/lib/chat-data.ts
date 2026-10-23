import type { ChatCitation } from "@pichat/shared";

export type ToolStatus = "running" | "done" | "error";

export interface ToolCall {
  id: string;
  name: string;
  description: string;
  status: ToolStatus;
  durationMs?: number;
}

export type Citation = ChatCitation;

export type MessageStatus = "thinking" | "streaming" | "done" | "stopped" | "error";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  status: MessageStatus;
  thinking?: string;
  tools?: ToolCall[];
  citations?: Citation[];
  candidateCitations?: Citation[];
  error?: string;
}

export interface Session {
  id: string;
  title: string;
  updatedLabel: string;
  group: "今天" | "更早";
}

export interface KnowledgeBase {
  id: string;
  name: string;
  documentCount: number;
}

export const knowledgeBases: KnowledgeBase[] = [
  { id: "kb-product", name: "产品手册", documentCount: 5 },
  { id: "kb-support", name: "售后知识库", documentCount: 5 },
  { id: "kb-policy", name: "内部制度", documentCount: 5 },
  { id: "kb-board", name: "董事会材料", documentCount: 1 },
];

export const seedSessions: Session[] = [
  { id: "s1", title: "出差住宿报销标准", updatedLabel: "刚刚", group: "今天" },
  { id: "s2", title: "客户投诉升级流程", updatedLabel: "10:24", group: "今天" },
  { id: "s3", title: "产品 v3 与 v2 的差异", updatedLabel: "昨天", group: "更早" },
  { id: "s4", title: "新员工入职清单", updatedLabel: "9月28日", group: "更早" },
];

export const seedCitations: Citation[] = [
  {
    id: "c1",
    index: 1,
    documentId: "doc-travel",
    documentTitle: "差旅管理制度（2026 版）.pdf",
    knowledgeBaseId: "kb-policy",
    knowledgeBaseName: "内部制度",
    chunkId: "chunk-018",
    snippet:
      "住宿费标准：一线城市每人每晚不超过 650 元；二线城市每人每晚不超过 450 元；其他城市每人每晚不超过 350 元。标准按出差目的地城市级别执行，同城多日连续住宿按每晚标准累计。",
  },
  {
    id: "c2",
    index: 2,
    documentId: "doc-reimburse",
    documentTitle: "员工报销管理办法 v3.2.pdf",
    knowledgeBaseId: "kb-policy",
    knowledgeBaseName: "内部制度",
    chunkId: "chunk-042",
    snippet:
      "实际支出超过住宿标准的，报销人须填写《超标准费用说明》，注明原因并附酒店水单。超出标准 20% 以内的，由部门负责人审批；超过 20% 的，须经财务负责人复核后方可报销。",
  },
  {
    id: "c3",
    index: 3,
    documentId: "doc-reimburse",
    documentTitle: "员工报销管理办法 v3.2.pdf",
    knowledgeBaseId: "kb-policy",
    knowledgeBaseName: "内部制度",
    chunkId: "chunk-057",
    snippet:
      "报销单应在出差结束后 15 个工作日内提交。逾期提交的，需补充书面说明并由部门负责人确认；超过 60 个工作日的，原则上不再受理。",
  },
];

export const seedMessages: ChatMessage[] = [
  {
    id: "m1",
    role: "user",
    content: "出差住宿报销标准是多少？如果超标了怎么处理？",
    createdAt: "2026-10-20T14:31:00+08:00",
    status: "done",
  },
  {
    id: "m2",
    role: "assistant",
    content:
      "根据《差旅管理制度（2026 版）》，住宿费按出差目的地城市级别执行：[1]\n\n一线城市每人每晚不超过 650 元，二线城市不超过 450 元，其他城市不超过 350 元。标准按每晚累计计算，同城连续住宿不额外上浮。\n\n如果实际住宿费超出标准，需要在报销单中填写《超标准费用说明》并附酒店水单：[2]\n\n- 超出标准 20% 以内：由部门负责人审批即可；\n- 超出标准 20% 以上：需要财务负责人复核后才能报销。\n\n另外，报销单应在出差结束后 15 个工作日内提交。逾期需要补充书面说明，超过 60 个工作日原则上不再受理。[3]",
    createdAt: "2026-10-20T14:31:08+08:00",
    status: "done",
    thinking:
      "问题同时涉及住宿标准和超标审批，属于「内部制度」知识库的差旅与报销两个文档。先定位住宿标准的现行版本，再核对超标审批的金额分档，最后确认报销时限，避免引用过期制度。",
    tools: [
      {
        id: "t1",
        name: "kb.search",
        description: "query=出差 住宿 报销 标准 超标 · 命中 6 个片段",
        status: "done",
        durationMs: 412,
      },
      {
        id: "t2",
        name: "kb.read",
        description: "读取 2 份文档：差旅管理制度、员工报销管理办法",
        status: "done",
        durationMs: 187,
      },
    ],
    citations: seedCitations,
  },
];

export const demoThinking =
  "先判断问题落在哪个知识库，再检索与问题最接近的片段。检索结果会按文档权限过滤：只读取当前账号可见的文档，并在生成引用前再复核一次。";

export const demoTools: ToolCall[] = [
  {
    id: "demo-search",
    name: "kb.search",
    description: "query=出差 住宿 报销 标准 · 检索 3 个已授权知识库",
    status: "running",
  },
  {
    id: "demo-read",
    name: "kb.read",
    description: "读取命中的文档片段并核对版本",
    status: "running",
  },
];

export const demoCitations: Citation[] = seedCitations;

export const demoAnswer =
  "根据已授权的「内部制度」知识库，我检索到与问题最相关的 3 个片段：[1]\n\n住宿费标准按出差目的地城市级别执行：一线城市每人每晚不超过 650 元，二线城市不超过 450 元，其他城市不超过 350 元。\n\n超出标准时，需要在报销单中填写《超标准费用说明》并附酒店水单。超出标准 20% 以内由部门负责人审批；超过 20% 需要财务负责人复核。[2]\n\n报销单应在出差结束后 15 个工作日内提交，逾期需补充书面说明，超过 60 个工作日原则上不再受理。[3]\n\n以上内容仅来自你有权阅读的文档。可在右侧引用面板核对原文片段，或换一种问法继续追问。";
