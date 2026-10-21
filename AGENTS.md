# AGENTS.md

## MVP 目标

先完成三件事：**权限体系、Agent Runtime、知识库体系**。MCP、CLI、多租户 SaaS、HA 均为后续能力，除非用户明确要求，不要提前展开。

## 先读什么

- `README.md`：当前完成度、环境要求、服务端口。
- `docs/当前进度.md`：当前完成度、已确认决策、mock/真实边界、环境阻塞、第一冲刺与验收。新会话接手后端前必须先读；每完成一个阶段更新它。
- `docs/adr/`：Pi SDK、MySQL ACL、SSE 的关键决策。
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
- 模型配置的 API Key 当前只放在浏览器 sessionStorage；真实实现必须写入服务端的加密字段（`model_configs.encrypted_api_key`），不得持久化明文密钥到 localStorage。

## RAGFlow 约束

- RAGFlow 只做解析和检索，不使用 RAGFlow Chat / RAGFlow Agent。
- RAGFlow 只暴露在内网，API Key 只存在服务端。
- 业务库与 RAGFlow 库分开，使用独立 database 和账号。
- 向量存储在 RAGFlow 的 Elasticsearch / Infinity 内，业务侧不另建向量库。
- 每个知识库固定 embedding 模型和维度；换模型需要重建索引。

## Pi Runtime 约束

- 使用 `@earendil-works/pi-coding-agent` 1.3.0；旧的 `@mariozechner/*` 已废弃。
- Pi 内置的 `read` / `write` / `edit` / `bash` 必须禁用，只注册知识库工具。
- 工具权限用 `tool_call` 拦截，工具结果用 `tool_result` 脱敏；高风险工具需要审批。
- Pi extension 与 Runtime 有相同的操作系统权限。只加载管理员审核过的 extension，不加载用户可控资源。
- Runtime 的 `cwd` 必须是隔离空目录，不要把上传文档放进去。
- 当前 `apps/agent-runtime` 只有健康检查和 Session 工厂；尚未接入 prompt、SSE、工具和会话持久化。不要把它当作已完成。
- 新增流式事件必须复用 `packages/shared/src/sse.ts`，不要另造事件格式。

## 环境与本地服务

- 根 `.env` 供 API / Runtime / Worker 使用；Web 使用 `apps/web/.env.local`。
- Docker MySQL 映射到 **3307**，Redis 6379，MinIO 9000/9001。
- RAGFlow 使用独立部署，不包含在 `infra/docker/compose.dev.yaml` 中。
- `pnpm db:push` 会直接修改数据库；对共享或生产库执行前必须先征得用户同意。
- Schema 改动后运行 `pnpm db:generate` 生成迁移，不要手改 `packages/db/drizzle/` 下的已生成 SQL。
- Next.js 的 `output: "standalone"` 曾在 Windows 上触发 symlink EPERM，当前未启用；不要随意加回，除非部署环境支持。

## 当前完成度

已实现：monorepo、对话主界面、登录页与 mock 会话、模型配置 UI（OpenCode Go / DeepSeek，浏览器会话密钥）、知识库与文档权限管理 UI、成员与组和审计日志 UI（均使用 mock 数据）、API 健康检查、Runtime 骨架、Worker 骨架、MySQL Schema、ACL 纯策略与 8 个单测、RAGFlow 客户端、SSE 协议。

未实现：真实 OIDC 登录、服务端模型配置与加密密钥、知识库/文档 ACL 真实仓储与管理接口、真实 IdP 成员同步与角色编辑、服务端审计写入、文档上传与解析轮询、SSE 对话接口、模型配置 UI 的服务端部分、MCP/CLI。

登录页在 `apps/web/app/login`，会话守卫在 `components/auth`；模型配置在 `components/model-config`，通过左下角账号菜单打开。

管理端页面在 `apps/web/app/(admin)`，使用 `components/admin` 下的 mock 数据上下文；不要把 UI 的可用人数或访问检查当成真实授权结果。

`pnpm test` 目前只覆盖 ACL 纯策略，不是完整测试覆盖；不要用健康检查通过来推断业务链路可用。
