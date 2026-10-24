# 任务 B Handoff：Web 接真

> 分支：`feat/web-real-api`
> 代码提交：`e5ff0cc`
> 状态：代码与静态验证完成；真实登录/ACL 联调等待任务 A 合入 `master` 后 rebase。

## 1. 完成内容

### BFF 与 Cookie

- 新增 `apps/web/app/api/auth/{login,logout,me}/route.ts`，转发到服务端 `API_URL`。
- 新增 `apps/web/app/api/[...path]/route.ts`，知识库、文档、ACL、访问检查统一走同源 `/api/*` 代理。
- `apps/web/lib/bff.ts` 透传请求 Cookie、API 状态码、错误体和 `Set-Cookie`；未使用 `NEXT_PUBLIC_*`。
- 保留原有 `app/api/health/route.ts`，未覆盖。

### 登录与会话

- `AuthProvider` 启动时请求 `/api/auth/me`；401 视为未登录，不再读写 `pichat-session` localStorage。
- `login` / `logout` 改为异步调用真实 API；用户类型使用 `@pichat/shared` 的 `SessionUser`。
- 登录页移除 SSO/OIDC/“任意密码”文案，增加张明、王芳两个种子账号提示（密码 `123456`），按 `code` 显示 `user_not_found`、`invalid_password`、`account_disabled`、`invalid_request`。
- `AuthGate` 行为保持不变：未登录访问业务页跳 `/login`。

### 管理页接真

- `AdminDataProvider` 启动加载 `GET /api/knowledge-bases`，并并行加载每个可见知识库的 `GET /api/knowledge-bases/:id/documents`。
- 映射 `KnowledgeBaseSummary` / `DocumentSummary` 到现有 UI 类型，新增 `aclVersion`、`canManageAcl`、`readableDocumentCount`、`effectiveReaderCount`、`createdAt`。
- `sizeLabel === null` 显示 `—`。
- 知识库列表、知识库详情、文档权限页增加 loading / error / retry / empty 状态。
- 文档 ACL：`PUT /api/documents/:id/acl`；知识库默认 ACL：`PUT /api/knowledge-bases/:id/acl`；成功后重新拉取知识库和文档。
- 有效人数统一使用服务端 `effectiveReaderCount`，修复了原 UI “不包含租户管理员”的错误文案。
- 访问检查改为仅检查当前登录用户，调用 `POST /api/access-check`，并明确“服务端判定”；不再展示其他用户的本地伪判定。
- 按服务端 `canManageAcl` 隐藏/禁用 ACL 编辑入口；只读角色显示“只读”。

### 未接真能力

以下入口保留，点击提示“本冲刺未接入”，不写入 mock、不伪造成功、不追加审计：

- 新建/删除知识库、修改知识库名称/描述。
- 上传文档、删除文档、重试解析。
- 批量授权、批量删除。

### 文案与审计边界

- 成员页改为“本地数据库成员，当前只读”，移除 IdP/OIDC/同步承诺；成员可读数为本地预览并已标注。
- 模型配置抽屉明确标记为过渡方案：元数据 localStorage、API Key sessionStorage，下一冲刺改服务端加密。
- 审计页明确为静态示例；ACL 操作不会向页面追加“刚刚”假事件。
- 侧边栏和账号菜单改为真实 `displayName` / 角色。

## 2. 启动与验证命令

```powershell
# 依赖包构建（fresh worktree 下 web typecheck 需要 dist）
pnpm --filter @pichat/shared build
pnpm --filter @pichat/access-control build

# Web 静态验证
$env:NODE_OPTIONS = "--max-old-space-size=4096"
pnpm --filter @pichat/web typecheck
pnpm --filter @pichat/web lint
pnpm --filter @pichat/web build

# 仓库级检查（顺序执行，规避本机并行构建内存不足）
$env:NODE_OPTIONS = "--max-old-space-size=2048"
pnpm exec turbo run typecheck --concurrency=1
pnpm exec turbo run test --concurrency=1
```

真实联调（任务 A 合入后）：

```powershell
# 根目录
pnpm dev
# 浏览器打开 http://localhost:3000
# 张明 / zhang.ming@example.com / 123456
# 王芳 / wang.fang@example.com / 123456
```

`apps/web/.env.local` 已配置 `API_URL=http://127.0.0.1:3001/api`，未提交。

## 3. 验证结果

已通过：

- `pnpm --filter @pichat/web typecheck`（本机偶发 Node 内存不足，设置 `NODE_OPTIONS=--max-old-space-size=4096` 后通过）。
- `pnpm --filter @pichat/web lint`。
- `pnpm --filter @pichat/web build`；构建产物包含 `/api/[...path]`、`/api/auth/login|logout|me`。
- `pnpm exec turbo run typecheck --concurrency=1`。
- `pnpm exec turbo run test --concurrency=1`：8 个 ACL 单测通过。

未通过 / 未执行：

- `pnpm lint` 仓库级失败：`apps/api` 与 `packages/shared` 在工作区为 CRLF，Biome 要求 LF。属于既有换行符环境问题，任务 B 未修改这些包。
- `pnpm exec turbo run build --concurrency=1`：并行构建时 Next worker 在本机内存压力下 OOM；单独执行 `pnpm --filter @pichat/web build` 通过。
- 真实登录、文档可见性、ACL 写后刷新、审计写入均未联调：当前工作区 API 未就绪，未伪造 E2E 结果。

## 4. 仍为 mock / 未接入

- 成员、部门、最近活跃：仍使用本地种子快照；成员/部门 API 下一冲刺接入。
- 审计页：静态示例数据；审计查询 API 下一冲刺接入。
- 模型配置：浏览器 localStorage + sessionStorage，仅为过渡方案。
- 对话流、SSE、上传/解析、Worker、RAGFlow：本冲刺范围外。
- 新建/删除知识库、上传/删除/重试文档、批量授权、知识库设置修改：入口保留，提示未接入。

## 5. 需要任务 A / 集成阶段确认

1. `POST /api/auth/login` 必须返回 `Set-Cookie: pichat_session=...; HttpOnly; Path=/; SameSite=Lax`，BFF 会原样透传。
2. 登录失败必须返回契约中的 `code`，前端按 code 显示错误。
3. `GET /api/knowledge-bases/:id/documents` 对 `member` 只返回 ACL 允许的文档；对管理员返回全部未删除文档元数据。
4. `effectiveReaderCount` 按契约包含 `tenant_admin` 角色覆盖；当前 UI 文案已按此调整。
5. `canManageAcl` 需要在知识库与文档两层都返回，前端用它控制 ACL 编辑入口。
6. 成员/组选择器仍使用 `apps/web/lib/admin-data.ts` 的 mock ID；若 A 的 seed ID 与 mock 不一致，需要同步本地快照。
7. 仓库级 lint 的 CRLF 问题建议集成阶段统一处理（例如 `.gitattributes` 或 Biome 统一格式化），不要在任务 B 分支修改 `packages` / `apps/api`。

## 6. 未修改

- 未修改 `packages/**`、`apps/api/**`、`apps/agent-runtime/**`、`apps/worker/**`。
- 未修改 `docs/api-contract.md`、`docs/当前进度.md`。
- 未提交 `.env.local` 或任何密钥。
