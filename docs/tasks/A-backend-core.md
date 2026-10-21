# 任务 A：后端与数据主线

> 工作区：`D:\AI Project\PiChat-A`
> 分支：`feat/backend-core`
> 契约：`docs/api-contract.md`（已冻结，先完整阅读）
> 只改本任务负责的文件；不要改 `apps/web`（除只读参考 seed 数据外）。

## 开始前

1. 阅读 `AGENTS.md`、`docs/当前进度.md`、`docs/api-contract.md`、`packages/db/src/schema.ts`、`packages/access-control/src/policy.ts`、`apps/web/lib/admin-data.ts`。
2. 工作区根目录已有本地 `.env`（含 `DATABASE_URL`），已被 gitignore；不要提交、不要打印数据库密码。
3. 数据库 `pichat` 和专用用户已经创建，使用 `127.0.0.1:3306`；不要猜 root 密码，不要改现有业务库。
4. 已获准执行 `pnpm db:generate`、`pnpm db:push`、`pnpm db:seed`。
5. 不要修改 `docs/api-contract.md` 的既有约定；发现缺口先在 handoff 中记录并询问用户。

## 目标

交付一条可 curl 验证的后端闭环：schema + migration + 可重复 seed + 登录会话 + 动态 ACL + 知识库/文档/ACL 薄接口 + 审计写入 + 单测。

## 范围

### A1 Schema 与迁移

按契约第 5 节修改 `packages/db/src/schema.ts`：

- `users.password_hash`
- `auth_sessions`
- `knowledge_base_acls`
- `knowledge_bases.acl_version`
- `model_configs.user_id` 和按用户隔离的唯一约束（只改 Schema，不做接口）

用 `pnpm db:generate` 生成迁移，不手改 `packages/db/drizzle/` 下生成的 SQL。然后执行 `pnpm db:push`。

### A2 Seed

- 先把 `apps/web/lib/admin-data.ts` 的 mock 数据快照到 `packages/db/src/seed-data.ts`，不要在运行时导入 Web 代码。
- 新增 `packages/db/src/seed.ts`，并在 `packages/db/package.json` 与根 `package.json` 增加 `db:seed` 脚本。
- 1 个 demo 租户、14 用户、5 组、4 知识库、16 文档；ID 与 mock 一致。
- 所有用户密码 `123456`，用 scrypt（`scrypt$saltHex$hashHex`，N=16384/r=8/p=1/keylen=64）。
- 写入 `knowledge_base_acls`、`document_acls`，`acl_version = 1`。
- 可重复执行：按固定 ID upsert；不得删除非 `tenant-demo` 数据。
- 保证张明可读全部；王芳对 `doc-travel`、`doc-security` 被 deny，且看不到 `kb-product` 文档。

### A3 认证

在 `apps/api` 实现：

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- Session guard、`@CurrentUser()`
- `@fastify/cookie`（Fastify 5 兼容版本）
- token：32 字节随机、库内存 sha256、HttpOnly Cookie `pichat_session`、SameSite=Lax、7 天、生产 Secure
- 错误码严格按契约第 2 节
- 不把密码/token 写日志

建议模块：`apps/api/src/modules/auth/*`、`apps/api/src/common/*`。API 是 CommonJS，注意 `@pichat/shared` 的 CJS 构建。

### A4 ACL 服务

- 扩展现有 `packages/access-control`：保留现有文档 ACL 策略，新增“知识库默认 ACL + 文档例外”的有效权限计算，deny 优先、tenant_admin 覆盖。
- 补单测：默认生效、文档 read 例外、文档 deny 覆盖默认、组/用户 deny 优先、tenant_admin 覆盖、跨租户拒绝、无授权。
- 在 API 内实现 `AccessControlService`：
  - `listReadableDocumentIds(principal, knowledgeBaseId)`
  - `canRead(documentId, principal)`
  - `effectiveReaderCount(documentId)`
  - `accessCheck(documentId, principal)`
  - 用户组展开
  - 进程内缓存 key 包含 `tenantId + knowledgeBaseId + aclVersion + userId + 排序后的 groupIds`
  - ACL 变更递增 `acl_version` 后立即失效
- 所有查询显式带 `tenantId`。

### A5 薄 API

按契约第 3 节实现：

- `GET /api/knowledge-bases`
- `GET /api/knowledge-bases/:id`
- `GET /api/knowledge-bases/:id/documents`
- `PUT /api/documents/:id/acl`
- `PUT /api/knowledge-bases/:id/acl`
- `POST /api/access-check`

要求：

- 角色校验：写 ACL 仅 `tenant_admin`、`knowledge_admin`；`member`/`security_admin` 返回 403。
- 文档列表：管理角色可列本租户文档元数据；`member` 只列可读文档。
- `effectiveReaderCount` 统计 active 用户，tenant_admin 计入。
- `sizeLabel` 固定 `null`（Schema 没有大小字段）。
- 所有响应类型复用 `packages/shared/src/api.ts`，不要另造字段。
- ACL 变更写 `audit_logs`，事务内完成；metadata 记录变更前后、actor、aclVersion。

### A6 测试与验证

- API 增加测试脚本（建议 vitest；可加 devDependency）。至少覆盖：
  - scrypt 校验
  - session token 哈希/过期
  - 知识库默认 + 文档例外组合
  - deny 优先
  - tenant_admin 覆盖
  - 跨租户拒绝
  - ACL 变更递增版本和写审计（可用测试库或仓储级测试）
- 执行：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`。
- 启动 API，用 PowerShell `Invoke-RestMethod` 或 curl 验证张明/王芳差异、401、403、404、ACL 变更和审计。
- 不要用健康检查通过推断业务链路可用。

### A7 Handoff

写 `docs/handoff-A.md`：

- 完成的提交 hash
- 迁移和 seed 命令
- 验证命令与真实输出摘要
- 未完成/阻塞项
- 给任务 B 的注意事项
- 不要修改 `docs/当前进度.md`

## 文件边界

允许修改：

- `packages/db/**`
- `packages/access-control/**`
- `packages/shared/**`（只补必要类型；契约字段已存在，优先不改）
- `apps/api/**`
- 根 `package.json`、`pnpm-lock.yaml`
- `docs/handoff-A.md`

禁止修改：

- `apps/web/**`
- `docs/api-contract.md`
- `docs/当前进度.md`
- `apps/agent-runtime/**`、`apps/worker/**`

## 完成标准

- 契约第 10 节后端部分全部满足。
- `pnpm db:push`、`pnpm db:seed` 可重复执行。
- 张明/王芳的 API 结果不同，deny 生效。
- 提交到 `feat/backend-core` 分支；不要 push 到 `master`。完成后报告提交 hash 和验证结果，等待用户审核。
