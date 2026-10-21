# 任务 B：Web 接真与文案

> 工作区：`D:\AI Project\PiChat-B`
> 分支：`feat/web-real-api`
> 契约：`docs/api-contract.md`（已冻结，先完整阅读）
> 只改 `apps/web/**` 和 `docs/handoff-B.md`；不要改 `packages/db`、`apps/api`、`packages/shared`、`docs/api-contract.md`。

## 开始前

1. 阅读 `AGENTS.md`、`docs/当前进度.md`、`docs/api-contract.md`、`apps/web/components/auth/*`、`apps/web/components/admin/admin-data.tsx`、`apps/web/lib/admin-data.ts`、`apps/web/app/login/page.tsx`。
2. 工作区根目录已有 `.env`；`apps/web/.env.local` 已设置服务端 `API_URL=http://127.0.0.1:3001/api`。不要提交 `.env*`，不要把内部 API 地址改成 `NEXT_PUBLIC_*`。
3. 可以按契约先写代码；API 未启动时完成静态验证，不要伪造 E2E 通过。合并任务 A 后再做真实登录和 ACL 联调。

## 目标

把现有 mock 登录、知识库页、文档权限页切换到真实 API；保留现有视觉、响应式和交互结构；未接真的功能明确提示，不伪造持久化或审计。

## 范围

### B1 BFF 与 Cookie

- 新增 `apps/web/app/api/auth/login/route.ts`、`logout/route.ts`、`me/route.ts`，转发到 API。
- 知识库/文档/ACL 请求也走 Web 同源 `/api/*` 转发；不要从浏览器直连 `localhost:3001`。
- 使用服务端 `API_URL`；不要用 `NEXT_PUBLIC_API_URL` 暴露内部地址。
- 透传 API 状态码、错误体和 `Set-Cookie`；浏览器只持有 HttpOnly Cookie。
- Next 15 的 `cookies()` 是异步的，注意 await。
- 可以新增一个 catch-all BFF 路由，但不要覆盖现有 `/api/health` 和 `/api/auth/*`。

### B2 AuthProvider 与登录页

- `AuthProvider` 改为启动时请求 `/api/auth/me`；未登录得到 401 时置空，不要当成网络错误。
- `login(email, password): Promise<void>` 调用 `/api/auth/login`；`logout(): Promise<void>` 调用 `/api/auth/logout`。
- 删除 `pichat-session` localStorage 读写；用户类型使用 `SessionUser`，角色联合类型与 `packages/shared` 一致。
- 登录页：
  - 移除企业 SSO 按钮/文案和“任意邮箱 + 任意密码”说明。
  - 增加种子账号提示：张明 `zhang.ming@example.com`、王芳 `wang.fang@example.com`，密码 `123456`。
  - 按 `code` 显示真实错误：`user_not_found`、`invalid_password`、`account_disabled`、`invalid_request`。
  - 保留左右分栏、移动端单列、密码显示切换、加载态。
- `AuthGate` 保持现有行为：未登录访问业务页跳 `/login`。

### B3 AdminDataProvider 接真

保留现有组件消费接口，内部替换数据源：

- 启动时 `GET /api/knowledge-bases`，再并行请求每个可见知识库的 `GET /api/knowledge-bases/:id/documents`。
- 映射为现有 `AdminKnowledgeBase` / `AdminDocument`，新增字段：
  - 知识库：`aclVersion`、`canManageAcl`、`readableDocumentCount`
  - 文档：`effectiveReaderCount`、`canManageAcl`
- `sizeLabel` 为 `null` 时显示 “—”。
- 增加 loading / error / empty 状态；加载失败提供重试，不要静默显示空列表。
- ACL 更新后重新拉取知识库和文档；不要只改本地 state。
- `documentAccessCounts` / `effectiveUsers` 现在基于 mock 用户和本地策略；本轮成员 API 未接，保留用户/组选择器的 mock 数据，但“有效人数”必须优先使用服务端 `effectiveReaderCount`，不要继续用 mock 计算值冒充真实结果。
- 访问检查：`POST /api/access-check` 只检查当前登录用户，不要从前端传其他 `userId`。现有“选择其他用户检查”的预览可以保留，但必须标注“本地预览，非服务端判定”；或者改为只检查当前用户。不要伪造服务端结果。

### B4 ACL 写操作

- `setDocumentExceptions` → `PUT /api/documents/:id/acl`，请求体 `{ exceptions }`，成功后刷新数据并提示成功。
- `setDefaultSubjects` → `PUT /api/knowledge-bases/:id/acl`，请求体 `{ defaultSubjects }`，成功后刷新。
- 失败时显示 API `message`；403 提示无权限，401 触发重新登录。
- 不要在浏览器写审计；审计页本轮继续使用现有 mock 数据，不要为 ACL 操作追加“刚刚”假事件。

### B5 未接真功能

创建/删除知识库、上传文档、删除文档、重试解析、批量授权、修改知识库名称/描述等后端本轮不实现：

- 保留现有入口和视觉，不要删除页面结构。
- 点击时提示“本冲刺未接入”，不要写入 mock 数据、不要本地伪造成功、不要写审计。
- 可以共用一个小工具函数统一处理。

### B6 文案修正

- 成员页：所有 “IdP 只读同步 / 来自企业 IdP / 等待同步 API” 改为“本地数据库成员，当前只读”，并去掉 IdP 相关承诺。
- 模型配置抽屉：把 sessionStorage 文案标记为过渡方案，说明后续改为服务端加密存储。
- 登录页：去掉 OIDC/SSO 文案。
- 知识库/权限页如果有“示例数据 / 模拟”提示，按真实接口状态更新。

### B7 验证

- `pnpm typecheck`、`pnpm lint`、`pnpm build`。
- 合并任务 A 后：
  - 张明登录后可见全部知识库；王芳登录后可见范围不同。
  - 王芳无法读取 `doc-travel`、`doc-security`。
  - 通过权限页修改文档 ACL，刷新后仍生效，有效人数变化。
  - 未登录访问 `/knowledge` 跳 `/login`。
  - 1440 / 1024 / 375 宽度、明暗主题、移动端无横向溢出、无 console error。
- 不要通过健康检查推断业务链路可用。

### B8 Handoff

写 `docs/handoff-B.md`：

- 完成的提交 hash
- 启动和验证命令
- 哪些功能已接真、哪些仍为 mock/未接入
- 阻塞项和需要 A 修复的问题
- 不要修改 `docs/当前进度.md`

## 文件边界

允许修改：

- `apps/web/**`
- `docs/handoff-B.md`

禁止修改：

- `packages/db/**`
- `packages/access-control/**`
- `packages/shared/**`
- `apps/api/**`
- `apps/agent-runtime/**`
- `apps/worker/**`
- `docs/api-contract.md`
- `docs/当前进度.md`

## 完成标准

- 登录、知识库列表/详情、文档列表、文档 ACL、默认 ACL 均由真实 API 驱动。
- 未实现的写操作不再伪造成功。
- 现有 UI 视觉和响应式不被破坏。
- 提交到 `feat/web-real-api` 分支；不要 push 到 `master`。完成后报告提交 hash 和验证结果，等待用户审核。
