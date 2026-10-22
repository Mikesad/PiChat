# AGENTS.md

## MVP 目标

先完成三件事：**权限体系、Agent Runtime、知识库体系**。MCP、CLI、多租户 SaaS、HA 均为后续能力，除非用户明确要求，不要提前展开。

## 先读什么

- `README.md`：当前完成度、环境要求、服务端口。
- `docs/当前进度.md`：当前完成度、已确认决策、mock/真实边界、环境阻塞、第一冲刺与验收。新会话接手后端前必须先读；每完成一个阶段更新它。
- `docs/test-plan-core.md`：核心链路测试方案（自动化门禁 + 真实环境人工 P0/P1）；每次验收按“先自动化、后人工”执行。
- `docs/handoff-E.md`：任务 E 交接提示词、自动化结果与下一步；新会话可直接复用其中的提示词。
- `docs/adr/`：Pi SDK、MySQL ACL、SSE、Runtime JSONL、知识库生命周期与删除语义的关键决策。
- `package.json`、`turbo.json`、各 workspace 的 `package.json`：命令的最终事实来源。

文档与脚本冲突时，以脚本和配置为准。进度文件是交接索引，不替代代码、Schema 和 ADR。

## 进度维护

- 每完成一个阶段，更新 `docs/当前进度.md` 的「当前完成度」「Mock 与真实边界」「第一冲刺」「变更记录」。
- 新会话接手后端前先读该文件；不要用健康检查通过推断业务链路可用。

## 环境与命令

- Node.js **>= 22.22.3**，pnpm 10.8。Pi SDK 1.3.0 与 Nest CLI 的依赖链都有硬性要求。
- 开发机已升级到 Node 22.23.3，安装目录仍为 `D:\nodejs20`；`.npmrc` 已设置 `engine-strict=true`，不要降级或绕过。
- 不要使用 npm/yarn，仓库使用 pnpm workspace + `pnpm-lock.yaml`。

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check
pnpm format
```

- 单包运行：`pnpm --filter @pichat/web dev`、`pnpm --filter @pichat/api build`。
- 单个测试：`pnpm --filter @pichat/access-control exec vitest run src/policy.test.ts`。
- 提交前至少执行：`pnpm typecheck -> pnpm lint -> pnpm test`；跨包改动再跑 `pnpm build`。
- `pnpm check` 是 Biome 全仓检查；仓库不使用 ESLint/Prettier。
- 目前没有 CI，不要假设远端会自动验证。

## 包边界与入口

- `apps/web`：Next.js 15 App Router，只负责 UI 和 BFF 代理；不得直连 RAGFlow。
- `apps/api`：NestJS + Fastify 网关，负责认证、租户、ACL、会话、管理接口；**CommonJS**。
- `apps/agent-runtime`：有状态的 Pi Session、工具和策略，仅内网调用；**ESM**。
- `apps/worker`：BullMQ 入库、RAGFlow 解析轮询、清理任务；**ESM**。
- `packages/db`：Drizzle Schema 与迁移，数据模型的唯一事实源。
- `packages/access-control`：纯 ACL 策略，不依赖数据库，便于单测。
- `packages/ragflow-client`：RAGFlow HTTP 封装，不要在其他包散落 fetch 调用。
- `packages/shared`：SSE 事件、领域类型、Zod Schema。

共享包通过 `tsup` 同时产出 ESM/CJS。新增 workspace 依赖时，先跑依赖包的 build，或直接用 Turbo 任务，避免 API 的 CommonJS 与 Runtime 的 ESM 互相导入失败。

## 权限约束

- 业务侧 ACL 是唯一事实源。MySQL 没有 RLS，所有查询必须显式带 `tenant_id`。
- `tenantId`、`userId`、`documentIds` 只能来自服务端认证上下文，**绝不能接受模型或前端传入的值**。
- 检索链路必须是：计算 `allowedDocumentIds` → RAGFlow `document_ids` 过滤 → 检索后复核 → 引用展示前再复核。
- ACL 缓存 key 必须带 `acl_version`；权限撤销后下一次工具调用立即生效。
- 开源 RAGFlow 只有 dataset 级权限，文档级授权由 PiChat 自己实现，不要依赖 RAGFlow 的权限 UI。
- 跨租户查询必须有集成测试；没有测试就不要声称隔离完成。
- 模型配置的 API Key 必须服务端 AES-256-GCM 加密存储（`model_configs.encrypted_api_key`），只在单次 Runtime run 的内存中出现；不得进浏览器、日志或 SSE。
- Runtime 只通过 `INTERNAL_SHARED_SECRET` 保护的 `/internal/*` 接口通信；API Key 不得写入磁盘或提交到仓库。
- Pi 会话 JSONL 由 Runtime 持久化在 `AGENT_RUNTIME_DATA_DIR`；业务 API 负责 MySQL `messages` 产品消息。两边都从同一次 run 产生，API 不读 JSONL，Runtime 不写聊天消息表。

## RAGFlow 约束

- RAGFlow 只做解析和检索，不使用 RAGFlow Chat / RAGFlow Agent。
- RAGFlow 只暴露在内网，API Key 只存在服务端。
- 业务库与 RAGFlow 库分开，使用独立 database 和账号。
- 向量存储在 RAGFlow 的 Elasticsearch / Infinity 内，业务侧不另建向量库。
- 每个知识库固定 embedding 模型和维度；换模型需要重建索引。

## Pi Runtime 约束

- 使用 `@earendil-works/pi-coding-agent` 1.3.0；旧的 `@mariozechner/*` 已废弃。
- Pi 内置的 `read` / `write` / `edit` / `bash` 必须禁用，只注册知识库工具。
- Runtime 已接入 prompt、SSE、`kb_search` / `kb_read` 和 Pi JSONL 会话持久化；内置编码工具仍然禁用。
- 工具权限用 `tool_call` 拦截，工具结果用 `tool_result` 脱敏；当前只允许知识库工具。
- Runtime 的 `cwd` 是每会话隔离空目录，不存放上传文件；`noExtensions` / `noSkills` / `noContextFiles` 保持开启。
- `kb_read` 只接受 `kb_search` 返回的引用序号，不接受模型传入的 `documentId`。
- 新增流式事件必须复用 `packages/shared/src/sse.ts`，不要另造事件格式。

## 环境与本地服务

- 根 `.env` 供 API / Runtime / Worker 使用；Web 使用 `apps/web/.env.local` 的 `API_URL`。
- `INTERNAL_SHARED_SECRET` 必须由 API 与 Runtime 共用；`AGENT_RUNTIME_DATA_DIR` 指向 Runtime JSONL 与工作目录，`AGENT_RUNTIME_URL` / `API_INTERNAL_URL` 供内部调用。这些值只写入本地 `.env`，不要提交。
- 当前开发机使用本机 MySQL **3306** 和专用库 `pichat`；Docker Compose 仍映射 3307，Redis 6379，MinIO 9000/9001。
- RAGFlow 使用独立部署，不包含在 `infra/docker/compose.dev.yaml` 中。
- `pnpm db:push` 会直接修改数据库；对共享或生产库执行前必须先征得用户同意。
- Schema 改动后运行 `pnpm db:generate` 生成迁移，不要手改 `packages/db/drizzle/` 下的已生成 SQL。
- `messages.created_at` 已改为 `timestamp(3)` 以保留毫秒顺序；迁移 `0003_abandoned_slayback.sql`。本机为保留现有消息，使用 `ALTER TABLE` 应用了同等变更，`db:push` 随后显示无变化；新环境可用迁移或 `db:push`，但不要接受 drizzle 的 `truncate table messages` 数据丢失提示。
- Next.js 的 `output: "standalone"` 曾在 Windows 上触发 symlink EPERM，当前未启用；不要随意加回，除非部署环境支持。
- 本机虚拟内存偏紧；`next dev` 可能在按需编译 `/api/[...path]` 时因 `RangeError: Array buffer allocation failed` 崩溃。需要稳定查看 UI 时先 `pnpm --filter @pichat/web build` 再 `pnpm --filter @pichat/web start`。

## 当前完成度

已实现：monorepo、真实邮箱密码登录与 HttpOnly 会话、Web BFF、知识库/文档/ACL 真实 API 与动态 ACL、可重复 seed、知识库与文档权限页接真、ACL 变更写审计、用户级模型配置加密存储、文档上传与 Worker RAGFlow 轮询、Agent Runtime（prompt、SSE、`kb_search` / `kb_read`、Pi JSONL 会话）、业务 API 的 chat 会话/消息/SSE 代理与 MySQL 落库、真实对话 UI（流式、思考、工具、引用、停止、重试）、知识库同步创建与软删除、文档软删除与清理、同库多文档批量授权（整体替换）、文档在线预览（知识库详情与聊天引用共用，PDF/DOCX/MD/TXT，ACL 校验 + Range）、成员/用户组查询与编辑（角色、状态、用户组、密码重置）、审计查询 API 与审计页接真、知识库设置更新与检索参数（topK/相似度阈值/向量权重）持久化并接入 Runtime。真实 RAGFlow 上传/解析/检索已用 MD/TXT/PDF/DOCX 四种格式验证，真实 ACL deny 已验证。

未实现：Agent + 真实 LLM 的 RAG 回答/引用 E2E（当前 `model_configs` 为 0，需先配置模型）、RAGFlow 解析配置（chunk 大小/方法）修改、用户组增删改、生产硬化、MCP/CLI、多租户 SaaS。

登录页在 `apps/web/app/login`，会话守卫在 `components/auth`；模型配置在 `components/model-config`，通过左下角账号菜单打开。对话页在 `apps/web/components/chat-workspace.tsx`，通过 Web BFF 调用业务 API。

管理端页面在 `apps/web/app/(admin)`：`knowledge`、`permissions`、`members`、`audit` 均已接真实 API。成员页的「可读文档」仍是前端预览，不是服务端按成员逐篇判定；成员编辑与密码重置仅 `tenant_admin` 可用。

`pnpm test` 覆盖 ACL 纯策略、SSE 解析、Runtime faux 集成、kb_search ACL 过滤、API 会话归属/内部 ACL/模型配置/聊天重试/跨租户、知识库创建与软删除、文档删除清理、批量授权、文档预览的 ACL/路径越界/软删除与 Range 解析、成员查询与编辑/最后管理员保护/密码重置清会话、审计查询过滤、知识库设置更新与检索参数、Worker 删除竞态；当前共 109 个测试，但不是完整端到端覆盖。真实 RAGFlow 解析/检索已用 MD/TXT/PDF/DOCX 验证；Agent + 真实 LLM 的端到端回答仍待模型配置。
