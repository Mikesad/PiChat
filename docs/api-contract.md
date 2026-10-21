# PiChat 第一冲刺 API 契约

> 状态：已冻结并完成第一冲刺实现，2026-10-21。变更前必须先征得用户同意，并同步修改本文件与 `packages/shared/src/api.ts`。
> 适用：任务 A（后端与数据）与任务 B（Web 接真）。两边的类型以 `@pichat/shared` 为准。
> 实施说明：ACL 写权限已按 `tenant_admin` + `knowledge_admin` 实现；`knowledge_admin` / `security_admin` 可读取本租户全部文档元数据，但不因此获得内容读取权限。

## 0. 已确认决策

- **单租户 MVP**：一次部署服务一家公司；登录只按邮箱查用户，不做租户选择、域名路由或租户码。`tenant_id` 继续贯穿所有表和查询，为后续扩展保留，但本期不做多租户 SaaS。
- **ACL 写权限**：`tenant_admin` 与 `knowledge_admin` 可修改文档 ACL 和知识库默认 ACL；`member`、`security_admin` 只读。若用户改为“仅 tenant_admin”，只需调整 `canManageAcl` 和写接口的角色校验。
- **审计**：A 负责写 `audit_logs`；审计查询 API 和审计页接真属于下一冲刺，B 继续使用现有 mock 审计页。
- **未接真的 UI**：创建/删除知识库、上传、重试、批量授权本轮不实现后端。B 保留现有入口，点击时提示“本冲刺未接入”，不得写入 mock 数据或伪造审计。
- **模型配置**：本轮不做服务端接口，继续使用浏览器 sessionStorage；只修正文案为过渡方案。
- **密码**：seed 演示账号统一 `123456`，只用于 demo 租户；数据库只存 scrypt hash。

## 1. 运行环境

| 项 | 值 |
| --- | --- |
| Web | `http://localhost:3000` |
| API | `http://localhost:3001/api` |
| MySQL | `127.0.0.1:3306`，数据库 `pichat`，专用用户 `pichat` |
| 数据库连接 | 根目录 `.env` 的 `DATABASE_URL`，不提交 |
| Redis | 本冲刺不需要 |
| RAGFlow | 本冲刺不调用 |

浏览器只访问 Web 同源 `/api/*`。Web 的 BFF 负责转发到 API，并透传 Cookie。API 不直接暴露给浏览器。

## 2. 认证契约

### Cookie

- 名称：`pichat_session`
- 值：32 字节随机 token 的 base64url 编码
- 属性：`HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`；生产环境加 `Secure`
- 数据库只存 token 的 sha256 hex，不存明文

### `POST /api/auth/login`

请求：

```json
{ "email": "zhang.ming@example.com", "password": "123456" }
```

成功 `200`，同时设置 Cookie：

```json
{
  "user": {
    "id": "u-zhang",
    "tenantId": "tenant-demo",
    "email": "zhang.ming@example.com",
    "displayName": "张明",
    "role": "tenant_admin",
    "groupIds": ["g-all", "g-platform"]
  }
}
```

失败：

| HTTP | code | 场景 |
| --- | --- | --- |
| 400 | `invalid_request` | 邮箱或密码缺失/格式错误 |
| 401 | `user_not_found` | 邮箱不存在 |
| 401 | `invalid_password` | 密码错误 |
| 401 | `account_disabled` | `users.status = disabled` |

邮箱按 trim + 小写比较。密码校验使用 scrypt，格式 `scrypt$saltHex$hashHex`，参数 N=16384、r=8、p=1、keylen=64。

### `GET /api/auth/me`

- `200`：`{ "user": SessionUser }`
- `401`：`{ "code": "unauthenticated", "message": "未登录" }`
- 同时在响应中刷新 `auth_sessions.last_used_at`，但不延长过期时间。

### `POST /api/auth/logout`

- 删除当前 session，清除 Cookie，返回 `204`。
- 未登录也返回 `204`（幂等）。

### SessionUser

```ts
interface SessionUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: "member" | "knowledge_admin" | "security_admin" | "tenant_admin";
  groupIds: string[];
}
```

## 3. 管理 API

所有接口都要求有效 session。`tenantId`、`userId`、`groupIds` 只能来自 session，禁止从请求体、query 或模型输出读取。

### 3.1 `GET /api/knowledge-bases`

返回当前用户可见的知识库列表：

```json
{
  "knowledgeBases": [
    {
      "id": "kb-policy",
      "name": "内部制度",
      "description": "公司规章制度、差旅与合规文件。默认全员可读。",
      "embeddingModel": "bge-m3 · 1024 维",
      "ragflowDatasetId": "ragflow_policy_2026",
      "aclVersion": 1,
      "defaultSubjects": [{ "type": "group", "id": "g-all" }],
      "documentCount": 5,
      "readableDocumentCount": 4,
      "canManageAcl": false,
      "createdAt": "2026-08-12T01:00:00.000Z",
      "updatedAt": "2026-10-20T02:24:00.000Z"
    }
  ]
}
```

可见性：

- `tenant_admin`、`knowledge_admin`、`security_admin`：本租户全部知识库。
- `member`：至少有一篇可读文档的知识库。
- 按 `updatedAt` 倒序。

字段规则：

- `documentCount`：未删除文档数。
- `readableDocumentCount`：按当前 principal 计算的可读未删除文档数；`tenant_admin` 等于 `documentCount`。
- `defaultSubjects`：知识库默认 ACL 中 `permission = read` 的主体，不含 deny。
- `canManageAcl`：当前用户角色是否为 `tenant_admin` 或 `knowledge_admin`。
- `createdAt` / `updatedAt`：ISO 8601 UTC 字符串。

### 3.2 `GET /api/knowledge-bases/:id`

- 返回 `{ "knowledgeBase": KnowledgeBaseSummary }`。
- 不可见或跨租户：`404 not_found`。
- 不内联文档列表。

### 3.3 `GET /api/knowledge-bases/:id/documents`

```json
{
  "documents": [
    {
      "id": "doc-travel",
      "knowledgeBaseId": "kb-policy",
      "title": "差旅管理制度（2026 版）.pdf",
      "status": "ready",
      "sourceKey": "D:\\PiChat\\uploads\\policy\\2026\\travel-v2026.pdf",
      "ragflowDocumentId": "rf_doc_travel",
      "sizeLabel": null,
      "exceptions": [{ "type": "user", "id": "u-wang", "permission": "deny" }],
      "effectiveReaderCount": 12,
      "canManageAcl": false,
      "createdAt": "2026-08-12T01:00:00.000Z",
      "updatedAt": "2026-10-20T02:24:00.000Z"
    }
  ]
}
```

可见性：

- `tenant_admin`、`knowledge_admin`、`security_admin`：返回本租户内该知识库的全部未删除文档元数据，便于权限管理；这不等于授予内容检索权限。
- `member`：只返回 ACL 允许的未删除文档。
- 知识库不可见：`404 not_found`。
- 按 `updatedAt` 倒序。

字段规则：

- `exceptions`：文档级 ACL，包含 `read` 和 `deny`。
- `effectiveReaderCount`：本租户内 `status = active` 且当前可读该文档的用户数；`tenant_admin` 计入（角色覆盖）。
- `sizeLabel`：当前 Schema 没有文件大小字段，固定返回 `null`；Web 显示 “—”。
- `canManageAcl`：当前用户角色是否为 `tenant_admin` 或 `knowledge_admin`。

### 3.4 `PUT /api/documents/:id/acl`

仅 `tenant_admin`、`knowledge_admin` 可调用。

请求：

```json
{
  "exceptions": [
    { "type": "user", "id": "u-wang", "permission": "deny" },
    { "type": "group", "id": "g-finance", "permission": "read" }
  ]
}
```

规则：

- 语义是“整体替换该文档的例外”，不是增量追加。
- `subjectType`/`subjectId` 必须属于当前租户；重复主体返回 `400`。
- 最多 200 条；`permission` 只能是 `read` 或 `deny`。
- 文档必须属于当前租户，否则 `404`。
- 事务内：替换 `document_acls` → `knowledge_bases.acl_version + 1` → 写 `audit_logs`。
- 审计：`action = document.acl.update`，`resourceType = document`，`resourceId = document id`，metadata 记录变更前后主体、actor、`aclVersion`。

成功 `200`：

```json
{
  "aclVersion": 2,
  "document": { "...": "DocumentSummary" }
}
```

失败：`403 forbidden`（角色不足）、`400 invalid_request`、`404 not_found`。

### 3.5 `PUT /api/knowledge-bases/:id/acl`

仅 `tenant_admin`、`knowledge_admin` 可调用。用于替换知识库默认访问范围。

请求：

```json
{
  "defaultSubjects": [
    { "type": "group", "id": "g-all" },
    { "type": "user", "id": "u-li" }
  ]
}
```

规则：

- 只写 `permission = read` 的默认条目；去重；主体必须属于当前租户。
- 整体替换该知识库的 `knowledge_base_acls`。
- 递增 `knowledge_bases.acl_version`，写审计：
  `action = knowledge_base.acl.update`，`resourceType = knowledge_base`。
- 返回 `{ "aclVersion": number, "knowledgeBase": KnowledgeBaseSummary }`。

### 3.6 `POST /api/access-check`

任何已登录用户可调用，但只检查自己的权限。

请求：

```json
{ "documentId": "doc-travel" }
```

响应 `200`：

```json
{ "allowed": false, "reason": "explicit_deny", "effectiveReaderCount": 12 }
```

- `reason`：`allowed`、`explicit_deny`、`no_grant`、`role_override`。
- 文档不存在或跨租户：`404 not_found`。
- 不做“管理员代查其他用户”的能力。

## 4. ACL 语义

有效权限 = 知识库默认 ACL + 文档级例外。

判定顺序：

1. `role = tenant_admin` → 允许，原因 `role_override`。
2. 当前用户/组命中的任意 `deny`（知识库默认或文档例外）→ 拒绝，原因 `explicit_deny`。
3. 当前用户/组命中的任意 `read` → 允许，原因 `allowed`。
4. 否则拒绝，原因 `no_grant`。

补充约束：

- 用户组通过 `group_members` 展开；principal 的 `groupIds` 由服务端查询，不接受前端传入。
- 知识库默认 ACL 只对同一知识库的文档生效。
- 文档例外优先于默认的 `read`，但 `deny` 始终优先。
- 缓存 key 必须包含 `tenantId + knowledgeBaseId + aclVersion + userId + 排序后的 groupIds`；ACL 变更后 `acl_version` 递增，下一次调用立即失效。
- 本冲刺允许使用进程内缓存；不引入 Redis。
- 所有仓储查询必须显式带 `tenantId`。

## 5. Schema 变更

在 `packages/db/src/schema.ts` 中完成，迁移用 `pnpm db:generate` 生成，不手改已生成 SQL。

1. `users.password_hash varchar(255) not null`
2. `auth_sessions`：
   - `id`、`tenant_id`、`user_id`、`token_hash`（unique）、`expires_at`、`created_at`、`last_used_at`
   - 索引：`(user_id)`、`(expires_at)`
3. `knowledge_base_acls`：
   - `id`、`tenant_id`、`knowledge_base_id`、`subject_type`、`subject_id`、`permission`、`created_at`
   - 唯一约束 `(knowledge_base_id, subject_type, subject_id)`
4. `knowledge_bases.acl_version int not null default 0`
5. `model_configs` 增加 `user_id`，唯一约束改为 `(tenant_id, user_id, provider, model_id)`；本轮只改 Schema，不做接口。

`tenant_id` 外键保留；不要删除现有列，不要改动外部数据库。

## 6. Seed

- 命令：`pnpm db:seed`（由 A 添加 root 与 `@pichat/db` 脚本）。
- 数据来源：`apps/web/lib/admin-data.ts` 的 mock 快照；A 必须先复制到 `packages/db/src/seed-data.ts`，避免 B 后续修改影响 seed。
- 租户：`tenant-demo`，名称 `PiChat Demo`，slug `pichat-demo`。
- 14 个用户、6 个组（mock 中 `u-zhang`/`u-liu` 引用了未定义的 `g-platform`，seed 补齐该组）、4 个知识库、16 篇文档，ID 与 mock 保持一致。
- 所有用户密码 `123456`；`u-gu` 保持 `disabled`。
- `g-all` 等组的 `external_id` 可以保留 mock 值，但 UI 文案必须说明来自本地数据库。
- 知识库默认 ACL 写入 `knowledge_base_acls`；文档例外写入 `document_acls`；`acl_version = 1`。
- 必须可重复执行：按固定 ID upsert；不要删除非 demo 租户的数据。

验证账号：

| 用户 | 邮箱 | 角色 | 组 |
| --- | --- | --- | --- |
| 张明 | `zhang.ming@example.com` | `tenant_admin` | `g-all`, `g-platform` |
| 王芳 | `wang.fang@example.com` | `member` | `g-all`, `g-support` |

验收差异：

- 张明可读全部知识库/文档。
- 王芳对 `kb-policy` 中 `doc-travel`、`doc-security` 被 deny；`kb-product` 默认 `g-product`，王芳不属于该组，不能读该库文档（除非有 read 例外）。
- 两个账号的 `GET /api/knowledge-bases` / 文档列表结果必须不同。

## 7. 错误格式

所有非 2xx 响应：

```json
{ "code": "forbidden", "message": "没有权限", "details": null }
```

| HTTP | code |
| --- | --- |
| 400 | `invalid_request` |
| 401 | `unauthenticated` / `user_not_found` / `invalid_password` / `account_disabled` |
| 403 | `forbidden` |
| 404 | `not_found` |
| 409 | `conflict` |
| 500 | `internal_error` |

不要把密码、token、API Key、数据库连接串写入日志或响应。

## 8. Web BFF

- 浏览器只调用 Web 同源 `/api/*`。
- `apps/web/app/api/auth/{login,logout,me}/route.ts` 转发到 API，透传 Cookie 和状态码。
- 知识库/文档/ACL 请求也通过 Web 同源路径转发；不得从浏览器直连 API，不得直连 RAGFlow。
- 使用服务端环境变量 `API_URL`（例如 `http://127.0.0.1:3001/api`），不要使用 `NEXT_PUBLIC_*` 暴露内部地址。
- BFF 必须保留 API 的错误体，前端根据 `code` 显示错误。
- 前端不得读取或持久化 session token；Cookie 必须 HttpOnly。

## 9. 本冲刺不做

- 上传、RAGFlow 解析轮询、Worker 接入。
- SSE 对话、Agent Runtime 工具。
- 模型配置 API、服务端加密 Key。
- 成员/组编辑、密码重置、IdP/OIDC。
- 审计查询 API、审计页接真。
- 多租户 SaaS、MCP、CLI。
- 知识库创建/删除、文档删除/重试、批量授权。

## 10. 验收

1. `pnpm db:generate` 生成迁移；`pnpm db:push`、`pnpm db:seed` 可重复执行。
2. 张明、王芳分别登录；`GET /api/auth/me` 返回正确角色和组。
3. `GET /api/knowledge-bases` 与文档列表在两位账号下结果不同。
4. 王芳无法读取被 deny 的文档；deny 优先于默认和 read 例外。
5. 修改文档例外后有效访问立即变化；`acl_version` 递增；`audit_logs` 有记录。
6. 未登录访问业务 API 返回 401；跨租户查询返回 404/403。
7. 数据库无明文密码；日志无密码/token；Cookie 为 HttpOnly。
8. `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 通过。
9. 现有 UI 视觉、移动端布局和明暗主题不被破坏。

## 11. 分支与合并

- 任务 A：分支 `feat/backend-core`，工作区 `D:\AI Project\PiChat-A`。
- 任务 B：分支 `feat/web-real-api`，工作区 `D:\AI Project\PiChat-B`。
- 两边只改各自负责的文件；发现需要改对方文件时，先在 handoff 中记录，不要直接改。
- 合并顺序：A → `master`，B rebase 到最新 `master`，再做端到端验证。
- 每个任务结束写 `docs/handoff-A.md` 或 `docs/handoff-B.md`；不要在任务分支修改 `docs/当前进度.md`，由集成阶段统一更新。
