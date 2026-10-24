# PiChat

基于 Pi SDK 与 RAGFlow 的企业知识库 Agent。

PiChat 是网页版 Agent：员工用自然语言提问，Agent 基于其有权限的知识库流式回答，并展示工具调用、思考过程和可追溯的引用。检索范围严格限制在当前用户有权阅读的文档内。

## 当前状态

第一冲刺已完成：真实登录与会话、动态 ACL、种子数据、知识库/文档/ACL 薄 API、Web BFF，知识库与文档权限页已接真实接口。任务 C 已完成：用户级模型配置加密 API + Web 接真；文档上传、BullMQ 入队、Worker 上传 RAGFlow 并轮询解析状态、失败重试与 Web 状态刷新。任务 D 已完成：Agent Runtime 接入 prompt、SSE、`kb_search` / `kb_read`、Pi JSONL 会话；业务 API 新增 chat 会话/消息/SSE 代理与 MySQL 落库；Web 对话页接真。任务 E 已完成：同步创建知识库（先建 RAGFlow dataset）、知识库软删除、文档软删除与本地/RAGFlow/队列清理、同库多文档批量授权。文档在线预览已完成：内容 API 做 ACL/租户/软删除校验，BFF 透传 Range，知识库详情页与聊天「引用与来源」均可打开 PDF/DOCX/MD/TXT 弹窗预览。当前本机 MySQL、Redis、RAGFlow 均已可达，API/Runtime/Worker 启动冒烟通过；真实 RAGFlow 上传/解析/检索已用 MD/TXT/PDF/DOCX 四种格式验证，真实 ACL deny 已验证；预览 API/BFF 的 200/206/416/401/404 已验证，Chrome headless 已验证 MD/TXT/DOCX 弹窗渲染与 PDF iframe 加载；本机已有用户模型配置，Agent + 真实 LLM 的回答/引用 E2E 待实际跑通。任务 F 已完成：成员/部门查询与编辑、密码重置、审计查询 API + 审计页接真、知识库设置更新与检索参数（topK/相似度阈值/向量权重）持久化并接入 Runtime；RAGFlow 解析配置（chunk 大小/方法）仍待排期。联网搜索已接入：`pi-web-access@0.44.0` 作为 Runtime 进程内 Pi 扩展加载，仅开放 `web_search`，开关按单次请求生效；Web 输入区支持点击/键盘/悬停滚轮切换。本地已配置 Tavily，工具级真实搜索已验证；完整 LLM 联网回答待模型配置。管理端已新增「模型配置」与「搜索引擎」页：模型按对话/Embedding/ReRank/视觉/语音分类，搜索引擎支持 Tavily、加密 Key、HTTP 代理、默认配置与测试连接；Embedding 接入知识库创建，ReRank 通过 RAGFlow `rerank_id` 接入检索。知识库访问范围已支持允许/禁止名单，知识库级 deny 覆盖文档 read；对话输入区支持按会话多选目标知识库，空选不检索。

已实现：

- pnpm + Turborepo monorepo
- Next.js 15 对话主界面：真实流式回答、思考过程、工具调用、引用联动、停止、重试、明暗主题、移动端适配
- 邮箱 + 密码登录：MySQL 用户 + scrypt 密码 hash + `auth_sessions` + HttpOnly Cookie
- Web BFF：登录、登出、me、知识库/文档/ACL、chat SSE 请求统一转发，浏览器不直连 API/RAGFlow
- 知识库管理 UI：列表、详情、文档状态、默认访问范围（允许/禁止）、设置；创建、删除、文档删除、批量授权与 ACL 读写已接真实 API
- 对话知识库多选：点击输入区知识库按钮打开表单，按会话在前端记忆；默认全选，空选表示不检索知识库
- 文档权限 UI：ACL 抽屉、有效人数、访问检查、多选批量授权；有效人数与访问判定来自服务端，主体名称与人数来自实时成员目录，批量授权要求同一知识库
- 部门成员 UI：真实 `GET /api/members` 成员/部门与最近活跃，`GET /api/members/directory` 为 ACL 提供轻量主体目录；`tenant_admin` 可编辑角色、状态、部门并重置密码
- 审计日志 UI：真实 `GET /api/audit-logs` 事件流、筛选、详情（actor、资源标题与 metadata 来自服务端）
- 模型配置 UI：OpenCode Go / DeepSeek 官方；配置按用户保存在服务端，API Key 使用 AES-256-GCM 加密，浏览器只拿脱敏值
- 文档上传 UI：真实 multipart 上传、逐文件状态、每 3 秒轮询 `pending`/`parsing`、失败文档重新解析
- 文档在线预览：知识库详情页与聊天引用共用弹窗，预览 PDF/DOCX/MD/TXT；内容接口校验 ACL/租户/软删除与路径边界，支持单段 Range
- NestJS + Fastify API：认证、知识库（含设置与检索参数）、文档上传/重试/内容预览、ACL、访问检查、成员与部门、审计查询、用户级模型配置、chat 会话/消息/SSE、内部 ACL 接口
- Agent Runtime：Pi Agent Loop、SSE、`kb_search` / `kb_read` / `kb_list_scope` / `kb_read_around` / `kb_find_in_document` / `kb_document_outline`、按会话目标知识库过滤、ACL scope/复核、Pi JSONL 会话、per-run 临时模型 Key
- 联网搜索：`pi-web-access` 进程内扩展，请求级开关，仅 `web_search`；Bocha/Tavily 服务端 Key，网页内容按不可信数据与 Markdown 链接引用处理
- MySQL 8 Schema 与迁移：租户、用户、组、知识库、文档、ACL、会话、消息、审计、模型配置
- 可重复 seed：1 租户、14 用户、6 组、4 知识库、16 文档，密码 `123456`
- ACL 策略：知识库默认允许/禁止 + 文档例外、deny 优先、知识库级 deny 覆盖文档 read、`tenant_admin` 覆盖；16 个纯策略单测
- 知识库生命周期：同步创建 RAGFlow dataset；知识库/文档软删除；批量整体替换文档例外；审计与 ACL 缓存失效
- 测试：ACL 16、API 79、Runtime 41、Shared 7、Worker 10、RAGFlow client 10，共 163 个
- `packages/queue`：统一队列名、Job 类型、确定性 jobId 与 Redis 连接参数；Worker 接通 RAGFlow 上传/解析轮询
- RAGFlow 客户端（含 dataset/document 删除与 404 幂等）、共享 SSE 协议与解析器、ADR

尚未实现：

- Agent + 真实 LLM 的完整 RAG 回答/引用 E2E（RAGFlow 四格式解析/检索已通过，待配置模型）
- 附件上传（当前仅输入区纸回形针图标占位，点击提示即将支持）
- 真实 RAGFlow 检索下的人工 abort/retry/JSONL 续聊验收
- RAGFlow 解析配置（chunk 大小/切分方法）修改与批量重新解析
- 部门增删改（当前只支持通过成员编辑替换所属部门）
- 生产硬化：CSRF、限流、日志、部署
- MCP / CLI / 多租户 SaaS

> 注意：`apps/agent-runtime` 已能创建会话、发送 prompt、调用知识库工具并通过 SSE 返回事件；真实 RAGFlow 检索仍取决于 `RAGFLOW_API_KEY` 与可用部署。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 运行时 | Node.js 22.22.3+、TypeScript |
| Monorepo | pnpm workspace、Turborepo |
| Web | Next.js 15、React 19、Tailwind CSS 4 |
| API | NestJS 12、Fastify Adapter |
| Agent Runtime | Fastify、`@earendil-works/pi-coding-agent` 1.3.0 |
| RAG | RAGFlow Retrieval API |
| 元数据 | MySQL 8、Drizzle ORM |
| 队列与缓存 | Redis 7、BullMQ |
| 文档存储 | 本地磁盘（MVP）；S3 / MinIO 后续 |
| Lint / 格式化 | Biome |

## 环境要求

- Node.js >= 22.22.3。Pi SDK 1.3.0 要求 Node 22.19+，Nest CLI 的依赖链要求 22.22.3+。
- pnpm >= 10.8.0
- MySQL 8.0+
- Redis 7+
- 可访问的 RAGFlow 部署
- 可选：Docker，用于本地 MySQL、Redis 与 MinIO

当前开发机已升级到 Node 22.23.3，安装目录仍为 `D:\nodejs20`。`pnpm install` 前不需要再切换版本；项目保留 `engine-strict=true`，不要把 Node 降回 20.x，否则会直接拒绝安装。

## 快速开始

```powershell
Copy-Item .env.example .env
# 按本机 MySQL 修改 DATABASE_URL；当前开发机使用 127.0.0.1:3306
# 生成 32 字节 base64 的 MODEL_CONFIG_ENCRYPTION_KEY 并写入 .env（不要提交）
$key = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
Add-Content .env "MODEL_CONFIG_ENCRYPTION_KEY=$key"
# API 与 Runtime 共用的内部密钥；不要提交
$internal = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
Add-Content .env "INTERNAL_SHARED_SECRET=$internal"
Copy-Item apps/web/.env.local.example apps/web/.env.local
pnpm install
pnpm db:push
pnpm db:seed

# 启动 API + Runtime + Web
pnpm --filter @pichat/api dev
pnpm --filter @pichat/agent-runtime dev
pnpm --filter @pichat/web dev

# 或启动全部 workspace（需要 Redis/RAGFlow 可用）
pnpm dev
```

本机虚拟内存紧张时，`next dev` 可能在按需编译 BFF 路由时崩溃（`RangeError: Array buffer allocation failed`）。改用生产构建：

```powershell
pnpm --filter @pichat/web build
pnpm --filter @pichat/web start
```

如果本机没有运行 MySQL：

```powershell
docker compose -f infra/docker/compose.dev.yaml up -d
```

文档上传需要 Redis（`REDIS_URL`）。Worker 还需要 `RAGFLOW_BASE_URL`、`RAGFLOW_API_KEY` 和 `RAGFLOW_DEFAULT_EMBEDDING_MODEL`；缺少时会明确报错，不会伪造解析成功。对话需要 API + Agent Runtime；可在左下角账号菜单或管理端「模型配置」中配置对话模型，在「搜索引擎」中配置 Tavily。知识库六个工具都需要可用的 RAGFlow。

`pnpm db:push` 会直接把 Drizzle Schema 应用到数据库。需要可审查的 SQL 迁移时使用 `pnpm db:generate`；迁移已生成在 `packages/db/drizzle/`。`pnpm db:seed` 会重置 demo 租户的知识库/文档/ACL 数据，可重复执行。

种子账号（密码均为 `123456`）：

- 张明：`zhang.ming@example.com`（tenant_admin）
- 王芳：`wang.fang@example.com`（member）
- 陈晨：`chen.chen@example.com`（knowledge_admin）
- 刘洋：`liu.yang@example.com`（security_admin）
- 顾强：`gu.qiang@example.com`（disabled）

## 服务端口

| 服务 | 地址 |
| --- | --- |
| Web | http://localhost:3000 |
| API | http://localhost:3001/api/health |
| Agent Runtime | http://localhost:3002/internal/health |
| MySQL（本机） | localhost:3306 |
| MySQL（Compose） | localhost:3307 |
| Redis | localhost:6379 |
| MinIO 控制台 | http://localhost:9001 |

## 目录结构

```text
apps/
  web/                 Next.js 对话界面
  api/                 NestJS 网关 / BFF
  agent-runtime/       Pi SDK 运行时、工具、策略
  worker/              BullMQ 文档入库任务
packages/
  shared/              SSE 协议、领域类型、Zod Schema
  db/                  Drizzle MySQL Schema 与客户端
  access-control/      文档 ACL 策略
  queue/               BullMQ 队列名、Job 类型与连接配置
  ragflow-client/      RAGFlow HTTP 客户端
infra/
  docker/              本地 MySQL、Redis、MinIO
  ragflow/             RAGFlow 集成说明
docs/adr/              架构决策记录
tests/                 规划中的测试分层
```

## RAGFlow 边界

PiChat 只把 RAGFlow 当作解析和检索引擎，不使用 RAGFlow Chat 或 RAGFlow Agent。

- RAGFlow 只部署在内网。
- RAGFlow API Key 不能暴露给浏览器。
- 每次检索必须同时传 `dataset_ids` 和服务端计算出的 `document_ids`。
- 检索返回后、发送给模型前，再执行一次文档 ACL 校验。
- 开源版 RAGFlow 权限只到数据集级。文档级授权由 PiChat 自己负责。

详见 `infra/ragflow/README.md`。

## MySQL 边界

业务数据库与 RAGFlow 数据库分开，使用独立数据库和独立账号。

MySQL 没有 PostgreSQL 的 Row-Level Security。所有租户查询必须显式带 `tenant_id`，仓储层测试必须覆盖跨租户访问。详见 `docs/adr/0002-mysql-acl.md`。

## 验证结果

任务 A–F + 联网搜索 + 知识库选择使用 Node 22.23.3 + 本机 MySQL 验证通过：

- `pnpm test`：163 个测试通过（ACL 16 + API 79 + Runtime 41 + Shared 7 + Worker 10 + RAGFlow client 10）
- `pnpm typecheck`：9 个 workspace 包全部通过（Turbo `--concurrency=1`）
- `pnpm lint`：9 个 workspace 包全部通过
- `pnpm build`：Web、API、Runtime、Worker 与共享包全部通过
- `pnpm db:generate` 生成 `0002_absent_strong_guy.sql`、`0003_abandoned_slayback.sql`、`0004_white_george_stacy.sql`；本机 `messages.created_at` 已改为 `timestamp(3)`，`knowledge_bases.deleted_at` 用 `ALTER TABLE` 保留数据
- 任务 E 集成测试覆盖：创建成功/重名 409/member 403/RAGFlow 失败 503 且不写 DB；知识库软删除与幂等、文档/ACL 级联不可见、跨租户 404、远端失败仍完成并写审计；文档软删除/ACL 清理/版本递增/本地目录删除/重复删除/跨租户 404；批量授权替换、跨库与跨租户拒绝、版本只加一次、单条审计、缓存失效；Worker 删除后 skip 与入库中删除清理
- 内部 ACL：`/internal/access/scope` 只返回 `ready` 且有 `ragflowDocumentId` 的文档；无 secret 返回 401；deny 文档在 scope 与检索后复核中被过滤
- Runtime faux 集成：`kb_search` 工具调用 → citation → `run.end` 快照 → JSONL 文件；`kb_list_scope` 文档句柄 → `kb_read_around` 相邻片段 → citation
- 联网搜索：扩展工厂只注册 `web_search`，配置关闭 fetch/source_check/commands；`webSearch=true` 的 Runtime 测试触发 `web.search`，无 Key 错误路径与本地 Tavily 真实搜索（1 条结果）均验证；Web typecheck/lint/build 通过
- 知识库级权限：组允许 + 用户知识库 deny 时，即使有文档 read 例外也全部不可读；允许/禁止重叠返回 400；对话 `knowledgeBaseIds` 透传、去重和空选不检索均有测试
- 知识库工具单测：scope 过滤与句柄、相邻窗口/ACL/stale、字面量精确查找、目录推断与回退
- 业务 API + fake OpenAI 手工 E2E：登录 → 创建 chat 会话 → SSE 流式回答 → MySQL user/assistant 消息与 metadata 落库
- 模型配置 HTTP 验证：创建/列表/更新省略 Key/设为默认/删除；响应不含明文或密文字段
- Web BFF 验证：登录、模型配置增删查、multipart 上传转发、chat SSE 透传
- Redis 未启动时上传返回 `503 service_unavailable`，文档保留为 `failed`；非法扩展名返回 `400`
- 真实 RAGFlow E2E：临时知识库上传 MD/TXT/PDF/DOCX，四篇均 `ready`；RAGFlow retrieval `code=0`，四个唯一口令全部命中；删除 204 且 dataset 已清理
- 真实 ACL：临时 deny 后王芳从 allowed 变为 `explicit_deny`，内部 scope 立即不含该文档；随后恢复原例外
- 启动冒烟：API `/api/health` 200、Runtime `/internal/health` 200、内部接口无 secret 401、Worker 输出 `worker_started`
- Agent + 真实 LLM 回答/引用未验证：本机已有模型配置，仍需实际跑通对话与引用；登录流程不作为本次验收重点
- 完整 LLM 联网回答未验证：本地已配置 Tavily，工具级真实搜索已验证；仍需真实模型验证回答与网页引用

UI 视觉、响应式、明暗主题、abort/retry、Runtime 重启后续聊仍待人工验收。`pnpm check` 目前会对 `packages/db/drizzle/meta/*.json` 报 Biome 格式差异，`pnpm lint` 通过。

## 下一步

1. 在 UI 配置真实模型并设为默认，补 Agent + LLM 的 `kb_search` → 回答 → 引用 E2E。
2. 人工验收 abort/retry、引用展示前复核、JSONL 续聊与批量授权/删除 UI。
3. RAGFlow 解析配置（chunk 大小/切分方法）修改与批量重新解析。
4. 生产硬化：CSRF、限流、日志、迁移与部署。
