# PiChat 第一冲刺 API 契约

> 状态：第一冲刺契约已冻结；任务 C/D/E 在末尾追加新接口，2026-10-22。变更前必须先征得用户同意，并同步修改本文件与 `packages/shared/src/api.ts`。
> 适用：任务 A（后端与数据）与任务 B（Web 接真）。两边的类型以 `@pichat/shared` 为准。
> 实施说明：ACL 写权限已按 `tenant_admin` + `knowledge_admin` 实现；`knowledge_admin` / `security_admin` 可读取本租户全部文档元数据，但不因此获得内容读取权限。

## 0. 已确认决策

- **单租户 MVP**：一次部署服务一家公司；登录只按邮箱查用户，不做租户选择、域名路由或租户码。`tenant_id` 继续贯穿所有表和查询，为后续扩展保留，但本期不做多租户 SaaS。
- **ACL 写权限**：`tenant_admin` 与 `knowledge_admin` 可修改文档 ACL 和知识库默认 ACL；`member`、`security_admin` 只读。若用户改为“仅 tenant_admin”，只需调整 `canManageAcl` 和写接口的角色校验。
- **审计**：A 负责写 `audit_logs`；审计查询 API 和审计页接真属于下一冲刺，B 继续使用现有 mock 审计页。
- **未接真的 UI**：创建/删除知识库、上传、重试、批量授权本轮不实现后端。B 保留现有入口，点击时提示“本冲刺未接入”，不得写入 mock 数据或伪造审计。
- **模型配置**：第一冲刺不做服务端接口；任务 C 已实现用户级加密存储 API，浏览器不再保存密钥（见第 12 节）。
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
    "departmentId": "g-platform"
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
  departmentId: string | null;
}
```

一个用户最多属于一个部门；`departmentId = null` 表示未分配，部门授权不会匹配该用户。

## 3. 管理 API

所有接口都要求有效 session。`tenantId`、`userId`、`departmentId` 只能来自 session，禁止从请求体、query 或模型输出读取。

### 3.1 `GET /api/knowledge-bases`

返回当前用户可见的知识库列表。管理端可追加 `?includeLocked=true`，让 `member` 也能看到没有任何可读文档的知识库，用于申请权限。

分页参数适用于所有管理端列表查询：`page`（从 1 开始，默认 1）、`pageSize`（最小 10、默认 10、最大 100）。响应统一携带 `pagination`：

```json
{
  "page": 1,
  "pageSize": 10,
  "total": 42,
  "totalPages": 5,
  "hasNext": true,
  "hasPrevious": false
}
```

```json
{
  "knowledgeBases": [
    {
      "id": "kb-policy",
      "name": "内部制度",
      "description": "公司规章制度、差旅与合规文件。默认全员可读。",
      "embeddingModel": "bge-m3 · 1024 维",
      "ownerDepartmentId": "g-platform",
      "ragflowDatasetId": "ragflow_policy_2026",
      "aclVersion": 1,
      "defaultSubjects": [{ "type": "group", "id": "g-all" }],
      "deniedSubjects": [{ "type": "user", "id": "u-gu" }],
      "documentCount": 5,
      "readableDocumentCount": 4,
      "canManageAcl": false,
      "createdAt": "2026-08-12T01:00:00.000Z",
      "updatedAt": "2026-10-20T02:24:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrevious": false
  }
}
```

可见性：

- `tenant_admin`、`knowledge_admin`、`security_admin`：本租户全部知识库。
- `member`：默认只返回至少有一篇可读文档的知识库；`includeLocked=true` 时返回本租户全部知识库。
- 按 `updatedAt` 倒序。

字段规则：

- `documentCount`：未删除文档数。
- `readableDocumentCount`：按当前 principal 计算的可读未删除文档数；`tenant_admin` 等于 `documentCount`。
- `defaultSubjects`：知识库默认 ACL 中 `permission = read` 的主体。
- `deniedSubjects`：知识库默认 ACL 中 `permission = deny` 的主体；知识库级 deny 优先于任何文档级 read 例外。
- `ownerDepartmentId`：归属部门（当前实现为 `departments.id`），仅用于治理展示与筛选；不会自动写入 ACL，也不影响访问判定。
- `canManageAcl`：当前用户角色是否为 `tenant_admin` 或 `knowledge_admin`。
- `createdAt` / `updatedAt`：ISO 8601 UTC 字符串。

### 3.2 `GET /api/knowledge-bases/:id`

- 返回 `{ "knowledgeBase": KnowledgeBaseSummary }`。
- 不可见或跨租户：`404 not_found`。
- 不内联文档列表。

### 3.3 `GET /api/knowledge-bases/:id/documents`

支持 `?includeLocked=true` 与分页参数 `page` / `pageSize`（最小 10、默认 10、最大 100）。不带 `includeLocked` 时保持原有可见性；带该参数时返回该知识库全部未删除文档元数据，并用 `canRead` 标记当前用户是否可读。

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
      "canRead": true,
      "canManageAcl": false,
      "createdAt": "2026-08-12T01:00:00.000Z",
      "updatedAt": "2026-10-20T02:24:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrevious": false
  }
}
```

可见性：

- `tenant_admin`、`knowledge_admin`、`security_admin`：返回本租户内该知识库的全部未删除文档元数据，便于权限管理；这不等于授予内容检索权限。
- `member`：默认只返回 ACL 允许的未删除文档；`includeLocked=true` 时返回全部文档元数据，供权限页展示锁标记。
- 知识库不可见：`404 not_found`。
- 按 `updatedAt` 倒序。

字段规则：

- `exceptions`：文档级 ACL，包含 `read` 和 `deny`；`canRead=false` 且当前用户不能管理 ACL 时返回空数组，避免泄露锁定文档的授权对象。
- `canRead`：当前 principal 是否可读取该文档；`false` 仅代表可在权限页看到元数据，不代表可预览或检索。
- `effectiveReaderCount`：本租户内 `status = active` 且当前可读该文档的用户数；`tenant_admin` 计入（角色覆盖）。
- `sizeLabel`：由 `documents.size_bytes` 格式化返回（B / KB / MB）；没有大小时返回 `null`。
- `mimeType` / `errorMessage`：任务 C 新增；解析失败原因写入 `errorMessage`。
- `canManageAcl`：当前用户角色是否为 `tenant_admin` 或 `knowledge_admin`。
- `aclMode`：`inherit`（继承知识库权限，默认）或 `restricted`（独立授权）。

### 3.4.1 `PUT /api/documents/:id/acl-mode`

仅 `tenant_admin`、`knowledge_admin` 可调用，用于切换文档权限模式。

```json
{ "mode": "restricted" }
```

- 事务内更新 `documents.acl_mode` → `knowledge_bases.acl_version + 1` → 写审计。
- 审计：`action = document.acl_mode.update`，metadata 记录 `before/after.aclMode` 与 `aclVersion`。
- 合法值只有 `inherit` / `restricted`；其他值返回 `400`。
- 成功返回 `{ aclVersion, document: DocumentSummary }`。

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
  ],
  "deniedSubjects": [
    { "type": "user", "id": "u-gu" }
  ]
}
```

规则：

- `defaultSubjects` 写 `permission = read`，`deniedSubjects` 写 `permission = deny`；两者都去重，主体必须属于当前租户。
- 省略 `deniedSubjects` 时保留现有知识库级禁止名单；显式传空数组才清空。
- 同一主体不能同时出现在允许和禁止名单中，否则返回 `400 invalid_request`。
- 知识库级 deny 覆盖文档级 read；文档级 read 例外无法覆盖。
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

判定顺序（严格按此顺序，任一前序失败即拒绝）：

1. **账号状态**：用户必须存在、属于当前租户且 `status = active`。
2. **知识库访问资格**：当前部门或用户本人在 `knowledge_base_acls` 中命中 `read`，且没有命中 `deny`。
3. **文档模式**：
   - `inherit`：知识库访问资格即可读；文档 `deny` 仍然优先。
   - `restricted`：还必须在 `document_acls` 中命中文档级 `read`。
   - 非法/未知模式：拒绝。
4. **文档 ACL**：文档级 `deny` 优先于文档级 `read`。
5. **异常**：权限查询失败、主体不存在、配置非法或数据不一致时默认拒绝。

补充约束：

- 一个用户最多属于一个部门（`users.department_id`）；部门授权只匹配该部门。未分配部门的用户不会匹配任何部门授权。
- 知识库授权仍支持 `user` 和 `group` 两种主体；`group` 即部门。
- 文档级授权不能绕过知识库访问资格：没有知识库 `read` 时，即使文档 ACL 有 `read` 也拒绝。
- `tenant_admin` 仍保留 `role_override`，但审计必须可见。
- 缓存 key 必须包含 `tenantId + knowledgeBaseId + aclVersion + userId + departmentId`；ACL 或模式变更后 `acl_version` 递增，下一次调用立即失效。
- `/internal/access/*` 只接收 `tenantId` 和 `userId`，角色、部门、账号状态由 API 每次查库解析；Runtime 传入的旧身份字段不参与判定。
- 历史消息中的引用快照在读取时按当前 ACL 复核，不可读引用不返回。
- 本冲刺允许使用进程内缓存；不引入 Redis。
- 所有仓储查询必须显式带 `tenantId`。

## 5. Schema 变更

在 `packages/db/src/schema.ts` 中完成，迁移用 `pnpm db:generate` 生成，不手改已生成 SQL。`0009_drop_group_members.sql` 例外：在删除旧表前加入一次性 `department_id` / `owner_id` 数据回填；`0010_rename_groups_to_departments.sql` 使用 `RENAME TABLE` 保留数据，并同步索引/外键名。

1. `users.password_hash varchar(255) not null`
2. `users.department_id varchar(36) null`（引用 `departments.id`，一个用户最多一个部门）；删除 `group_members`
3. `documents.acl_mode enum('inherit','restricted') not null default 'inherit'`
4. `knowledge_bases.owner_id varchar(36) null`（创建者，仅治理展示）
5. `auth_sessions`：
   - `id`、`tenant_id`、`user_id`、`token_hash`（unique）、`expires_at`、`created_at`、`last_used_at`
   - 索引：`(user_id)`、`(expires_at)`
6. `knowledge_base_acls`：
   - `id`、`tenant_id`、`knowledge_base_id`、`subject_type`、`subject_id`、`permission`、`created_at`
   - 唯一约束 `(knowledge_base_id, subject_type, subject_id)`
7. `knowledge_bases.acl_version int not null default 0`
8. `model_configs` 增加 `user_id`，唯一约束改为 `(tenant_id, user_id, provider, model_id)`；本轮只改 Schema，不做接口。

`tenant_id` 外键保留；不要删除现有列，不要改动外部数据库。

## 6. Seed

- 命令：`pnpm db:seed`（由 A 添加 root 与 `@pichat/db` 脚本）。
- 数据来源：`apps/web/lib/admin-data.ts` 的 mock 快照；A 必须先复制到 `packages/db/src/seed-data.ts`，避免 B 后续修改影响 seed。
- 租户：`tenant-demo`，名称 `PiChat Demo`，slug `pichat-demo`。
- 14 个用户、6 个组（`g-all` 保留为历史组但不再分配用户）、4 个知识库、16 篇文档，ID 与 mock 保持一致。
- 每个用户只分配一个部门（`users.department_id`）；`u-gu` 保持 `disabled`。
- 所有用户密码 `123456`。
- `g-all` 等组的 `external_id` 可以保留 mock 值，但 UI 文案必须说明来自本地数据库。
- 知识库默认 ACL 写入 `knowledge_base_acls`；文档例外写入 `document_acls`；`acl_version = 1`。
- `docs[].aclMode` 默认 `inherit`；安全制度、投诉 SOP、定价策略使用 `restricted` 并显式列出 read 主体。
- `knowledge_bases.owner_id` 记录创建者；缺少创建者时迁移回填该租户最早的 `tenant_admin`。
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
| 503 | `service_unavailable` |
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

## 12. 任务 C 新增接口（2026-10-21）

### 12.1 用户级模型配置

所有接口要求登录；`tenantId`、`userId` 只来自 session。响应不包含 `encryptedApiKey` 或明文 API Key。

- `GET /api/model-configs?kind=chat|embedding|rerank|vision|speech` → `{ modelConfigs: ModelConfigSummary[] }`
- `POST /api/model-configs` → `201 { modelConfig }`
  - body：`{ kind, provider, modelId, displayName, baseUrl, apiKey, makeDefault? }`
  - `kind` 为 `chat`、`embedding`、`rerank`、`vision`、`speech`；当前可配置 `chat`、`embedding`、`rerank`。
  - `chat` 支持 `opencode-go`、`deepseek`；`embedding` / `rerank` 支持 `siliconflow`。
  - 同一 `(tenant, user, kind, provider, modelId)` 重复返回 `409 conflict`。
- `PUT /api/model-configs/:id` → `200 { modelConfig }`
  - body 同上；`apiKey` 省略或空字符串时保留旧 Key。
- `DELETE /api/model-configs/:id` → `204`
- `POST /api/model-configs/:id/default` → `200 { modelConfig }`
  - 事务内只清除当前用户、同一 `kind` 的其他默认配置。

`ModelConfigSummary`：

```ts
{
  id: string;
  kind: "chat" | "embedding" | "rerank" | "vision" | "speech";
  provider: "opencode-go" | "deepseek" | "siliconflow";
  modelId: string;
  displayName: string;
  baseUrl: string;
  isDefault: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string; // 如 ****abcd；无 Key 时为空字符串
  createdAt: string;
  updatedAt: string;
}
```

API Key 使用 AES-256-GCM 加密，存储格式 `v1:<iv>:<tag>:<ciphertext>`；密钥只从 `MODEL_CONFIG_ENCRYPTION_KEY` 读取。

### 12.2 用户级搜索引擎配置（2026-10-24）

所有接口要求登录；`tenantId`、`userId` 只来自 session。当前 `provider` 只支持 `tavily`。

- `GET /api/search-configs` → `{ searchConfigs: SearchConfigSummary[] }`
- `POST /api/search-configs` → `201 { searchConfig }`
  - body：`{ provider, name, remark?, apiKey, proxy?, makeDefault? }`；首个配置自动设为默认。
- `PUT /api/search-configs/:id` → `200 { searchConfig }`
  - `apiKey` 省略或空字符串时保留旧 Key。
- `DELETE /api/search-configs/:id` → `204`
  - 删除默认配置时，自动把最近更新的其他配置设为默认。
- `POST /api/search-configs/:id/default` → `200 { searchConfig }`
- `POST /api/search-configs/test` → `200 { ok, message, latencyMs }`
  - body：`{ provider, id?, apiKey?, proxy? }`；`id` 存在且 `apiKey` 为空时使用服务端已保存密钥。

`SearchConfigSummary` 返回 `id`、`provider`、`name`、`remark`、`proxy`、`isDefault`、`hasApiKey`、`apiKeyMasked` 与时间字段，不返回明文 Key。聊天开启联网搜索时，业务 API 解析当前用户默认配置，仅通过内网把 `provider`、`apiKey`、`proxy` 传给 Runtime。

### 12.3 文档上传与重新解析

- `POST /api/knowledge-bases/:id/documents`
  - `multipart/form-data`，文件字段名 `file`，一次一个文件。
  - 允许 `.pdf`、`.docx`、`.md`、`.txt`；扩展名与 MIME 白名单同时校验。
  - 默认最大 20MB，可用 `UPLOAD_MAX_BYTES` 配置。
  - 文件保存到 `UPLOAD_DIR/<tenantId>/<knowledgeBaseId>/<documentId>/<safeFileName>`；文件名清洗后禁止路径穿越。
  - 创建 `pending` 文档并入队；成功 `201 { document: DocumentSummary }`。
  - Redis 不可用：`503 service_unavailable`；文档保留为 `failed`，`errorMessage` 说明队列不可用，可调用重新解析重试。
  - 仅 `tenant_admin`、`knowledge_admin` 可上传；其他角色 `403`。
- `POST /api/documents/:id/reparse` → `200 { document }`
  - 重置 `status=pending`、清空 `errorMessage` 并入队；权限与租户校验同上。

`DocumentSummary` 在原有字段基础上增加 `mimeType`、`errorMessage`，`sizeLabel` 来自 `size_bytes`。

## 13. 任务 D 新增接口（2026-10-22）

### 13.1 对话会话与消息

所有接口要求登录；`tenantId`、`userId` 只来自 session。跨租户或他人会话返回 `404 not_found`。

- `GET /api/chat/sessions` → `{ sessions: ChatSessionSummary[] }`
- `POST /api/chat/sessions` → `201 { session: ChatSessionSummary }`
  - body：`{ title?, modelConfigId? }`；`title` 缺省为“新对话”。
  - `modelConfigId` 可选；实际模型在发送消息时解析。
- `GET /api/chat/sessions/:id/messages` → `{ session, messages: ChatMessageSummary[] }`
  - 只返回 `user` / `assistant`；`messages.metadata` 保存 thinking、tools、citations、usage、runStatus。
- `POST /api/chat/sessions/:id/messages` → `text/event-stream`
  - body：`{ content, modelConfigId?, thinkingLevel?, retry?, webSearch?, knowledgeBaseIds? }`
  - `knowledgeBaseIds`：本次 run 的目标知识库；缺省表示当前用户全部可读知识库，空数组表示不检索知识库。Runtime 会再次按租户和 ACL 过滤。
  - 未配置模型：`409 conflict`。
  - 同一会话同时只允许一个 run：`409 conflict`。
  - `retry=true` 时重试最后一条失败回答，不重复插入 user message；最后一条不是失败回答时返回 `409`。
- `POST /api/chat/runs/:runId/abort` → `204`
  - 只能中止当前用户自己的 run；不存在或不属于当前用户返回 `404`。

`ChatSessionSummary`：

```ts
{
  id: string;
  title: string;
  modelProvider: string;
  modelId: string;
  thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  createdAt: string;
  updatedAt: string;
}
```

`ChatMessageSummary`：

```ts
{
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  metadata: {
    runId?: string;
    status?: "completed" | "aborted" | "error";
    model?: { provider: string; modelId: string; displayName: string };
    thinkingLevel?: string;
    thinking?: string;
    tools?: Array<{ id; name; label; description; status; durationMs? }>;
    citations?: ChatCitation[];
    usage?: { inputTokens; outputTokens; cacheReadTokens; cacheWriteTokens; totalTokens };
    error?: { code: string; message: string; retryable?: boolean };
  } | null;
}
```

### 13.2 SSE 事件

事件复用 `packages/shared/src/sse.ts`，`event:` 为类型，`data:` 为 JSON；每个事件带 `${runId}:${seq}` 形式的 `id`。

| 事件 | data |
| --- | --- |
| `run.start` | `{ runId, sessionId, assistantMessageId, model }` |
| `message.start` | `{ messageId }` |
| `text.delta` | `{ delta }` |
| `thinking.delta` | `{ delta }` |
| `tool.start` | `{ toolCallId, toolName, label, description }` |
| `tool.end` | `{ toolCallId, toolName, status: "ok"\|"error", durationMs?, description? }` |
| `citation.add` | `ChatCitation` |
| `usage` | `ChatUsage` |
| `compaction` | `{ phase: "start"\|"end", reason }` |
| `run.end` | 最终快照：`runId/sessionId/assistantMessageId/status/content/thinking/tools/citations/usage/finishReason?/error?` |
| `error` | `{ code, message, retryable? }` |

`run.end` 的 `status` 为 `completed`、`aborted` 或 `error`。业务 API 以 `run.end` 快照写 MySQL；流中断时用已累积的增量事件兜底。

### 13.3 Runtime 内部接口

以下接口只允许内网调用，使用 `Authorization: Bearer <INTERNAL_SHARED_SECRET>`；不得通过 Web BFF 暴露。

- `POST /internal/chat/run` → `text/event-stream`
  - body：`ChatRunRequest`（runId、sessionId、assistantMessageId、principal、model、thinkingLevel、history、prompt）。
  - 同一 `runId` 或同一 `sessionId` 的并发 run 返回 `409`。
- `POST /internal/chat/runs/:runId/abort` → `204`
- `POST /internal/access/scope`
  - body：`{ principal, knowledgeBaseIds? }`
  - 只返回 `ready` 且有 `ragflowDocumentId` 的可读文档。
- `POST /internal/access/check`
  - body：`{ principal, documentId }` → `{ allowed, reason }`

### 13.4 存储边界

- Runtime：`AGENT_RUNTIME_DATA_DIR/<tenantId>/<userId>/<sessionId>/pi-sessions/*.jsonl` 保存 Pi 会话；`workspace/` 是隔离空目录。
- 业务 API：MySQL `messages` 保存产品消息；API 不读 JSONL。
- Runtime 不写 `messages`；API 不写 JSONL。
- 模型 API Key 只在单次 run 的内存和临时 auth 目录中存在，run 结束删除；不得进入响应、日志、SSE 或仓库。

## 14. 任务 E 新增接口（2026-10-22）

### 14.1 `POST /api/knowledge-bases`

仅 `tenant_admin`、`knowledge_admin` 可调用。

请求：

```json
{
  "name": "售后知识库",
  "description": "客服与售后规范",
  "embeddingConfigId": "model-config-uuid",
  "ownerDepartmentId": "g-support"
}
```

- `name`：trim 后 1–160 字符，在本租户内唯一（软删除的知识库仍占用名称，重复返回 `409 conflict`）。
- `description`：可选，最长 4000 字符。
- `embeddingConfigId`：可选；当前用户拥有的 `kind=embedding` 模型配置 ID。提供时使用其 `modelId`（RAGFlow 模型名）创建数据集。
- `ownerDepartmentId`：可选；当前租户内的部门（`departments.id`），仅作为归属元数据，不改变 ACL。
- 未提供 `embeddingConfigId` 时，优先使用当前用户默认 Embedding 配置，其次 `embeddingModel` 字段，最后服务端 `RAGFLOW_DEFAULT_EMBEDDING_MODEL`。全部缺失时返回 `503 service_unavailable`。
- 创建为**同步**：API 先调用 RAGFlow `createDataset`（数据集名 `pichat-<knowledgeBaseId>`，便于追溯），成功后才写 MySQL 并返回 `201 { knowledgeBase: KnowledgeBaseSummary }`。
- RAGFlow 不可用或拒绝创建：`503 service_unavailable`，不写 MySQL 半成品；若 MySQL 最终写入失败，API 会尽力删除刚创建的 RAGFlow dataset。
- 审计：`action = knowledge_base.create`，`resourceType = knowledge_base`，metadata 记录名称、dataset id、embedding model。

### 14.2 `DELETE /api/knowledge-bases/:id`

仅 `tenant_admin`、`knowledge_admin` 可调用；跨租户或不存在返回 `404 not_found`。

- 成功 `204`，无响应体。
- 语义为**软删除**：写 `knowledge_bases.deleted_at`，同一事务内把未删除文档置为 `deleted` 并写 `deleted_at`、删除知识库默认 ACL 与文档 ACL、递增 `acl_version`。
- 事务后取消该知识库下文档的 BullMQ 任务、删除 `UPLOAD_DIR/<tenantId>/<knowledgeBaseId>`、尝试删除 RAGFlow dataset。
- RAGFlow 或本地清理失败不回滚 DB，也不改变 `204`；审计 metadata 记录 `localCleanup`、`remoteCleanup`、错误摘要。
- 重复删除幂等：已软删除返回 `204`，不重复写审计。
- 删除后知识库、文档、ACL、内部检索 scope 均不可见。
- 审计：`action = knowledge_base.delete`。

### 14.3 `DELETE /api/documents/:id`

仅 `tenant_admin`、`knowledge_admin` 可调用；跨租户或不存在返回 `404 not_found`。

- 成功 `204`，无响应体。
- 软删除文档：`deleted_at` + `status = "deleted"`，删除该文档的 `document_acls`，递增所属知识库 `acl_version` 并清进程内 ACL 缓存。
- 取消 `ingest-<documentId>` 队列任务；删除 `UPLOAD_DIR/<tenantId>/<knowledgeBaseId>/<documentId>`（校验路径在 `UPLOAD_DIR` 内）。
- 若存在 `ragflow_document_id`，尝试从 RAGFlow 删除；404 视为幂等成功，其他失败记录审计。
- 重复删除幂等；本地/远端清理失败不回滚 DB。
- 审计：`action = document.delete`，metadata 记录文件、dataset、`aclVersion`、清理结果。

### 14.4 `PUT /api/knowledge-bases/:id/documents/acl`

仅 `tenant_admin`、`knowledge_admin` 可调用。一次只能操作一个知识库。

请求：

```json
{
  "documentIds": ["doc-1", "doc-2"],
  "exceptions": [{ "type": "group", "id": "g-support", "permission": "read" }],
  "mode": "replace"
}
```

规则：

- `documentIds`：1–200，去重；必须全部属于该知识库、当前租户且未删除，否则 `400 invalid_request`。
- `exceptions`：最多 200；重复 subject 返回 `400`；`type/id` 必须属于当前租户，否则 `400`。
- 本轮只支持 `mode = "replace"`（可省略）。语义是**整体替换**这些文档的文档例外，不是追加；每篇文档写入相同的 exceptions。
- 事务内删除这些文档的旧 `document_acls`、插入新例外、知识库 `acl_version` 只递增一次；随后清 ACL 缓存。
- 审计：`action = document.acl.batch_update`，`resourceType = knowledge_base`，`resourceId = knowledgeBaseId`，metadata 记录 `documentIds`、变更前后摘要、`aclVersion`。
- 成功 `200 { aclVersion, documents: DocumentSummary[] }`，`documents` 按请求中的 `documentIds` 顺序返回。
- 跨租户知识库 `404`；角色不足 `403`。

### 14.5 `GET /api/documents/:id/content`

在线预览原文件，要求登录。知识库详情页与聊天「引用与来源」共用此接口。

- 权限：按当前 principal 计算文档有效 ACL（`tenant_admin` 角色覆盖）；无读权限、跨租户、文档或所属知识库已软删除、本地文件缺失均返回 `404 not_found`。可见元数据不代表可读取内容。
- 成功 `200`：流式返回 `UPLOAD_DIR` 内原文件；`Content-Type` 按文件名归一化，`Content-Disposition: inline`，并返回 `Accept-Ranges: bytes`、`Content-Length`。
- 单段 `Range: bytes=start-end`（也支持 `bytes=start-`、`bytes=-suffix`）返回 `206` 与 `Content-Range`；非法或多段 Range 返回 `416` 和 `Content-Range: bytes */<size>`。
- 本地路径必须经 `realpath` 校验仍在 `UPLOAD_DIR` 内，禁止路径穿越；预览响应不暴露本地路径。
- Web BFF 透传 `Range` 及 `Content-Length`、`Content-Range`、`Accept-Ranges`、`Content-Disposition`。

### 14.6 队列与 Worker 语义

- 任务 jobId 固定为 `ingest-<documentId>`（BullMQ 不允许 jobId 含冒号），入队前尝试移除同 ID 的旧任务；完成的任务立即移除，失败任务最多保留 1000 个。
- 删除接口在 Redis 不可用时仍完成 DB 软删除；日志记录取消失败，Worker 通过 DB 的 `deleted_at` / `status=deleted` 再次确认并跳过。
- Worker 在写 RAGFlow、更新文档状态前使用条件更新；若文档在入库过程中被删除，会尽力删除已上传的 RAGFlow 文档并返回 `skipped`。
- Worker 找不到知识库（含软删除）时跳过，不再把文档标记为失败后继续上传。

## 15. 任务 F 新增接口（2026-10-22）

### 15.1 `PATCH /api/knowledge-bases/:id`

更新知识库名称、描述与检索参数。`tenant_admin` / `knowledge_admin` 可调用；`member` / `security_admin` 返回 `403`。

请求：

```json
{
  "name": "内部制度 2026",
  "description": "更新后的描述",
  "ownerDepartmentId": "g-platform",
  "retrievalTopK": 6,
  "retrievalSimilarityThreshold": 0.2,
  "retrievalVectorWeight": 0.3
}
```

- 所有字段可选；`name` 1–160，`retrievalTopK` 1–50，阈值与向量权重 0–1。
- `ownerDepartmentId` 传 `null` 可清空归属部门；只更新归属元数据，不递增 `aclVersion`，也不改变访问权限。
- 名称在租户内唯一（忽略已软删除知识库），重复返回 `409 conflict`。
- 成功 `200 { knowledgeBase: KnowledgeBaseSummary }`；审计 `knowledge_base.update`，metadata 记录 `changes` 与生效后的 `retrieval`。
- `KnowledgeBaseSummary` 新增 `retrievalTopK`、`retrievalSimilarityThreshold`、`retrievalVectorWeight`。
- Runtime 通过内部 scope 获取每个知识库的 `retrieval` 配置，`kb_search` / `kb_read` 按知识库配置设置 `topK` / `similarity_threshold` / `vector_similarity_weight`。

### 15.2 `GET /api/members`

返回当前租户成员与部门。`tenant_admin` / `security_admin` 可读；其他角色 `403`。

支持分页参数 `page` / `pageSize`（最小 10、默认 10、最大 100）；成员按 `displayName` 升序分页，`groups` 始终返回本租户完整部门列表。

```json
{
  "members": [
    {
      "id": "u-zhang",
      "email": "zhang.ming@example.com",
      "displayName": "张明",
      "role": "tenant_admin",
      "status": "active",
      "departmentId": "g-platform",
      "lastActiveAt": "2026-10-22T10:00:00.000Z",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "groups": [{ "id": "g-all", "name": "全员", "externalId": "idp-all-staff", "memberCount": 14 }],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 14,
    "totalPages": 2,
    "hasNext": true,
    "hasPrevious": false
  }
}
```

- `lastActiveAt` 取该用户最近一次 `auth_sessions.last_used_at`，没有会话时为 `null`。
- 查询显式带 `tenant_id`；不返回密码哈希。

### 15.2.1 `GET /api/members/directory`

返回当前租户的轻量主体目录，供 ACL 选择器、主体名称与人数展示使用。任意已登录用户可读，但不返回邮箱与最近活跃时间。

```json
{
  "members": [
    {
      "id": "u-zhang",
      "displayName": "张明",
      "role": "tenant_admin",
      "status": "active",
      "departmentId": "g-platform"
    }
  ],
  "groups": [{ "id": "g-all", "name": "全员", "memberCount": 4 }]
}
```

- `groups[].memberCount` 只统计 `status=active` 的成员，与 `effectiveReaderCount` 的口径一致。
- 查询显式带 `tenant_id`；不返回密码哈希、邮箱或最近活跃时间。

### 15.3 `PATCH /api/members/:id`

`tenant_admin` 可编辑成员角色、状态与所属部门（一个用户最多一个部门）。

```json
{ "role": "knowledge_admin", "status": "active", "departmentId": "g-product" }
```

- `departmentId` 必须属于当前租户，或传 `null` 清空部门，否则 `400 invalid_request`。
- 不能修改自己的角色或状态（`400`）。
- 不能移除最后一个启用的 `tenant_admin`（`400`）。
- 成功 `200 { member: MemberSummary }`；审计 `member.update`。

### 15.4 `POST /api/members/:id/password`

`tenant_admin` 重置成员密码。

```json
{ "password": "至少 6 位" }
```

- 成功后删除该成员全部 `auth_sessions`，现有登录立即失效；审计 `member.password_reset`（不记录密码）。

### 15.5 `GET /api/audit-logs`

`tenant_admin` / `security_admin` 可读；返回当前租户审计事件，按时间倒序。

查询参数：`page`（默认 1）、`pageSize`（最小 10、默认 10、最大 100）、`action`、`resourceType`、`result`（`success` / `denied` / `failed`）、`actorId`。

```json
{
  "logs": [
    {
      "id": "audit-uuid",
      "actorId": "u-zhang",
      "actorName": "张明",
      "action": "knowledge_base.update",
      "resourceType": "knowledge_base",
      "resourceId": "kb-policy",
      "resourceLabel": "内部制度",
      "result": "success",
      "summary": "更新知识库设置「内部制度」",
      "metadata": { "changes": ["name"] },
      "createdAt": "2026-10-22T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrevious": false
  }
}
```

- 资源标题按 `resourceType` 批量补齐（知识库名 / 文档标题 / 成员名）；`result` 取自 metadata，缺省 `success`。
- 审计事件只读，不提供修改或删除接口。
