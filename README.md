# PiChat

基于 Pi SDK 与 RAGFlow 的企业知识库 Agent。

PiChat 是网页版 Agent：员工用自然语言提问，Agent 基于其有权限的知识库流式回答，并展示工具调用、思考过程和可追溯的引用。检索范围严格限制在当前用户有权阅读的文档内。

## 当前状态

当前仓库已完成对话主界面与管理端 UI 的第一版，数据仍以 mock 为主，后端接口尚未接通。

已实现：

- pnpm + Turborepo monorepo
- Next.js 15 对话主界面：流式回答、思考过程、工具调用、引用联动、明暗主题、移动端适配
- 登录页与 mock 会话：未登录访问重定向到 `/login`，任意有效邮箱 + 任意密码可进入
- 左下角账号菜单：模型配置（OpenCode Go / DeepSeek 官方）与退出登录
- 模型配置保存后，输入框底部的模型选择器立即切换；API Key 仅保存在当前标签页
- 知识库管理 UI：列表、详情、文档状态、上传抽屉、默认访问范围、设置
- 文档权限 UI：文档权限表、ACL 抽屉、有效人数、访问检查、批量授权
- 成员与组 UI：IdP 只读同步、成员/用户组详情、有效可读文档数（mock）
- 审计日志 UI：权限与管理事件流、筛选与事件详情（mock，跨页面可见）
- NestJS API 与健康检查
- Fastify Agent Runtime 骨架：Pi SDK Session 工厂、事件映射
- BullMQ 文档入库 Worker 骨架
- MySQL 8 Schema：租户、用户、用户组、文档、ACL、会话、消息、审计日志、模型配置
- 文档 ACL 策略包，8 个单元测试通过；`tenant_admin` 角色覆盖
- RAGFlow 客户端：健康检查、数据集列表、检索
- 共享 SSE 事件协议
- 架构决策记录（ADR）

尚未实现：

- OIDC / Keycloak 登录（当前为 mock 登录页与会话）
- 服务端模型配置与加密 API Key（当前配置存在浏览器，密钥仅在 sessionStorage）
- 知识库、文档、ACL 的真实仓储与管理接口（当前管理端使用 mock 数据）
- 文档上传与 RAGFlow 解析轮询
- SSE 对话接口
- 真实 IdP 成员同步、角色编辑与服务端审计写入（当前 UI 为 mock）
- 模型配置界面
- MCP 与 CLI 工具

> 注意：`apps/agent-runtime` 目前只有健康检查和 Pi Session 工厂，还不能创建会话、发送消息或调用工具。`/internal/runtime` 返回的 capabilities 是能力声明，不代表已经接通。

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
| 对象存储 | S3 / MinIO |
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
Copy-Item apps/web/.env.local.example apps/web/.env.local
pnpm install
pnpm db:push
pnpm dev
```

如果本机没有运行 MySQL：

```powershell
docker compose -f infra/docker/compose.dev.yaml up -d
```

`pnpm db:push` 会直接把 Drizzle Schema 应用到数据库。需要可审查的 SQL 迁移时使用 `pnpm db:generate`；初始迁移已经生成在 `packages/db/drizzle/`。

## 服务端口

| 服务 | 地址 |
| --- | --- |
| Web | http://localhost:3000 |
| API | http://localhost:3001/api/health |
| Agent Runtime | http://localhost:3002/internal/health |
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

脚手架使用 Node 22.23.3 验证通过：

- `pnpm test`：8 个 ACL 策略测试通过
- `pnpm typecheck`：8 个 workspace 包全部通过
- `pnpm lint`：8 个 workspace 包全部通过
- `pnpm build`：Web、API、Runtime、Worker 与共享包全部通过
- 管理端 UI 使用 mock 数据完成：知识库列表/详情、上传流程、文档权限表、ACL 抽屉、访问检查、批量授权
- 登录 → 模型配置（OpenCode Go / DeepSeek 官方）→ 对话模型切换 → 退出登录 → 重新登录恢复配置，全流程本地验证通过
- API、Runtime、Web 健康检查接口本地返回正常

未执行完整 `pnpm dev` 联调，因为本机 MySQL、Redis、RAGFlow 尚未启动。`pnpm db:push` 也未执行，避免直接修改本机数据库。

## 下一步

1. 把管理端 mock 数据与模型配置替换为真实接口：知识库、文档、ACL、有效人数、访问检查、成员同步、审计与模型密钥。
2. 接入企业 IdP（OIDC / Keycloak）与 HttpOnly 会话 Cookie，替换 mock 登录。
3. 实现文档上传与 RAGFlow 解析轮询。
4. 实现 ACL 仓储与 `allowedDocumentIds`。
5. 增加 SSE 对话接口与 Pi 工具：`kb.search`、`kb.read`。
6. 完成流式对话、引用展示、模型与思考强度切换。
