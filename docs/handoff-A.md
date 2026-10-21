# Handoff A：后端与数据主线

> 分支：`feat/backend-core`
> 实现提交：`d16d70e feat(api): implement backend core auth, ACL and knowledge base APIs`
> 本文档单独提交；最终 HEAD 以 `git log --oneline -3` 为准。
> 未修改 `docs/当前进度.md`、`docs/api-contract.md` 和 `apps/web` 的业务代码。

## 1. 完成范围

- A1 Schema：`users.password_hash`、`auth_sessions`、`knowledge_base_acls`、`knowledge_bases.acl_version`、`model_configs.user_id` 与按用户隔离唯一约束。
- A2 Seed：`packages/db/src/seed-data.ts`、`packages/db/src/seed.ts`，根与 `@pichat/db` 的 `db:seed` 脚本。
- A3 认证：登录、登出、当前用户、Session guard、`@CurrentUser()`、HttpOnly Cookie、scrypt 校验。
- A4 ACL：纯策略扩展 + API 内 `AccessControlService`（默认 ACL + 文档例外、deny 优先、tenant_admin 覆盖、进程内缓存、组展开、有效访问人数）。
- A5 薄 API：知识库列表/详情/文档、文档 ACL、知识库默认 ACL、access-check、审计写入。
- A6 测试：ACL 纯策略、scrypt、session token、ACL 变更/缓存失效/审计、跨租户拒绝。
- 额外：`POST /api/auth/logout` 支持空 JSON body，避免 BFF 发送空体时被 Fastify 以 400 拒绝。

## 2. 数据库命令

```powershell
pnpm db:generate
pnpm db:push
pnpm db:seed
```

- `db:generate` 生成 `packages/db/drizzle/0001_lumpy_liz_osborn.sql`，未手改生成 SQL。
- 本机 exec 环境不是 TTY，`db:push` 实际执行方式为：
  `pnpm --filter @pichat/db exec drizzle-kit push --force`
- `db:seed` 已连续执行两次，均成功，结果一致：
  `tenant=tenant-demo users=14 groups=6 knowledgeBases=4 documents=16`。
- 最终数据库已再次执行 seed 回到演示基线：4 个知识库 `acl_version=1`、`knowledge_base_acls=3`、`document_acls=7`、`auth_sessions=0`；此前验证产生的 `audit_logs=4` 保留。
- seed 只清理/重写 demo 固定 ID 与 demo 组/知识库/文档 ACL，不删除其他租户数据。

## 3. 验证命令与真实结果

| 命令 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过，`Lockfile is up to date` |
| `pnpm typecheck` | 通过，12/12 tasks successful |
| `pnpm lint` | 通过，8/8 tasks successful |
| `pnpm test` | 通过，25 tests：access-control 16、API 9（3 个测试文件） |
| `pnpm build` | 通过，8/8 tasks successful |
| `pnpm db:seed` | 连续两次成功，可重复执行 |

本机可用提交内存（Windows commit charge）非常低；不设置限制时 `tsc`/`nest build` 偶发
`Fatal process out of memory: Zone`。最终验证时使用：

```powershell
$env:NODE_OPTIONS="--max-old-space-size=512"
pnpm typecheck
pnpm lint
pnpm test
pnpm build
Remove-Item Env:NODE_OPTIONS
```

这是环境问题，不是代码问题；四类命令均以退出码 0 结束。

### 真实 API 验证（curl/PowerShell，已脱敏）

- 登录张明：`200`，`role=tenant_admin`，`groupIds=["g-all","g-platform"]`；响应字段为
  `displayName,email,groupIds,id,role,tenantId`。
- Cookie：`pichat_session=<redacted>; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`。
  生产环境 `NODE_ENV=production` 时附加 `Secure`。
- 张明 `GET /api/knowledge-bases`：4 个知识库，全部 `readableDocumentCount=documentCount`。
- 王芳 `GET /api/knowledge-bases`：仅 `kb-policy(3/5)`、`kb-support(5/5)`；`kb-product`、
  `kb-board` 不可见。
- `kb-policy` 文档：张明 5 篇；王芳只有 `doc-expense`、`doc-procurement`、`doc-onboarding`，
  `doc-travel`、`doc-security` 被 deny。
- `doc-travel`：`effectiveReaderCount=12`；王芳 `{"allowed":false,"reason":"explicit_deny"}`；
  张明 `{"allowed":true,"reason":"role_override"}`。
- 未登录访问业务 API：`401 {"code":"unauthenticated"}`。
- 王芳修改文档 ACL：`403 {"code":"forbidden"}`。
- 不存在的文档 access-check：`404 {"code":"not_found"}`。
- 错误登录：错误密码 `invalid_password`；停用账号 `account_disabled`；不存在邮箱
  `user_not_found`。
- 登出：`204`；再次 `GET /api/auth/me` 返回 `401`；空 JSON body 的登出也返回 `204`。
- 文档 ACL 变更：移除王芳 deny 后 `aclVersion 1→2`，王芳立即变为 allowed，文档列表出现
  `doc-travel`，effectiveReaderCount 12→13；恢复 deny 后 `aclVersion 2→3`，王芳再次
  `explicit_deny`。
- 知识库默认 ACL：给 `kb-board` 增加 `g-all` 后王芳从 404 变为 200；恢复后再次 404，
  `aclVersion 2→3`。
- 重复主体：`400 {"code":"invalid_request","details":{"subject":"user:u-wang"}}`。
- 跨租户主体：`400 invalid_request`；跨租户文档在集成测试中返回 `not_found`。
- 审计：验证期间写入 4 条 `audit_logs`（2 条 `document.acl.update`、2 条
  `knowledge_base.acl.update`），metadata 包含 actor、before/after、result、aclVersion。
- 数据库密码列：非 `scrypt$` 开头的 hash 数量为 0；session token_hash 长度 64。
- API 日志未出现 `123456`、`pichat_session=`、`scrypt$` 或 `password` 字符串。

## 4. 契约/数据冲突，需要用户确认

1. **组数量 5 vs 6**：mock 的 `users` 中张明、刘洋引用 `g-platform`，但 mock `groups`
   只有 5 个且没有 `g-platform`。为满足外键和契约要求的张明 `groupIds=["g-all","g-platform"]`，
   seed 新增了 `g-platform`（平台组，`externalId=idp-platform`），因此实际是 **6 个组**。
   如果坚持 5 个组，需要决定：删除用户上的 `g-platform`，或把它并入现有组。
2. **SessionUser 形状**：`packages/shared/src/api.ts` 原实现是 `SessionUser extends Principal`，
   字段为 `userId`；契约第 2 节要求 `id`。已按契约改为
   `{id, tenantId, email, displayName, role, groupIds}`。任务 B 应使用 `user.id`，
   不要再读 `user.userId`。
3. **演示密码**：`docs/当前进度.md` 早期写的 `Pichat@2026` 与冻结契约的 `123456` 冲突；
   本任务按契约使用 `123456`（见 `docs/api-contract.md`），数据库只存 scrypt hash。
4. **`pnpm check`**：仓库基线文件以 CRLF 提交，而 Biome 默认要求 LF，未改动的全仓文件会让
   `pnpm check` 报格式错误。为保证 `pnpm lint` 通过，仅在工作区把 `apps/web` 等文件的
   换行规范为 LF；`git diff` 无内容变化，未修改任何 Web 业务代码。建议后续单独决定是否加
   `.gitattributes` 或统一执行 `pnpm format`。
5. **`model_configs.user_id NOT NULL`**：当前表为空，迁移可直接加列；若未来在已有数据的库上
   执行，需要先回填或分步迁移。

## 5. 未完成/不在本任务范围

- 上传、RAGFlow 解析轮询、Worker 接入。
- SSE 对话、Agent Runtime 工具。
- 模型配置服务端接口与加密 Key。
- 本地成员/组编辑、密码重置、OIDC/IdP。
- 审计查询 API 与审计页接真（本任务只写 `audit_logs`）。
- 知识库创建/删除、文档删除/重试、批量授权。
- Redis/进程外缓存。

## 6. 给任务 B 的注意事项

- API 地址：`http://127.0.0.1:3001/api`；BFF 使用服务端 `API_URL`，不要在浏览器暴露。
- 登录/登出/me：转发 `Set-Cookie` 与 `Cookie`；`pichat_session` 是 HttpOnly，浏览器 JS
  不可读取。
- 登出可发送空 body，或 `{}` 也可以。
- 所有管理接口都要求 session；错误体固定 `{ "code", "message", "details" }`。
- `GET /api/knowledge-bases` 已按角色过滤；`member` 只看到至少一篇可读文档的知识库。
- `GET /api/knowledge-bases/:id/documents` 的 `sizeLabel` 固定为 `null`，UI 显示 `—`。
- `PUT /api/documents/:id/acl` 是整体替换；重复主体返回 400；只有 `tenant_admin` 和
  `knowledge_admin` 可写。
- `PUT /api/knowledge-bases/:id/acl` 只写 `read` 默认条目，重复主体会去重。
- `POST /api/access-check` 只检查当前登录用户本人。
- `GET /api/auth/me` 会刷新 `last_used_at`，但不延长 7 天过期时间。
- 本任务没有提供 `GET /api/documents/:id`、审计查询、模型配置、成员/组编辑接口。
- 测试账号：张明 `zhang.ming@example.com`、王芳 `wang.fang@example.com`；密码按契约。
- 数据库已回到 seed 基线，可直接联调。

## 7. 本地运行提示

```powershell
pnpm --filter @pichat/api build
pnpm --filter @pichat/api start
```

API 默认 `3001`，全局前缀 `/api`，健康检查 `GET /api/health`。
