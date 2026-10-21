# PiChat

基于 Pi SDK 与 RAGFlow 的企业知识库 Agent。

PiChat 是网页版 Agent：员工用自然语言提问，Agent 基于其有权限的知识库流式回答，并展示工具调用、思考过程和可追溯的引用。检索范围严格限制在当前用户有权阅读的文档内。

## 当前状态

第一冲刺已完成：真实登录与会话、动态 ACL、种子数据、知识库/文档/ACL 薄 API、Web BFF，知识库与文档权限页已接真实接口。任务 C 已完成：用户级模型配置加密 API + Web 接真；文档上传、BullMQ 入队、Worker 上传 RAGFlow 并轮询解析状态、失败重试与 Web 状态刷新。当前本机 Redis/RAGFlow 不可用，真实解析 E2E 未执行；SSE 对话、成员编辑和审计查询尚未开始。

已实现：

- pnpm + Turborepo monorepo
- Next.js 15 对话主界面：流式回答、思考过程、工具调用、引用联动、明暗主题、移动端适配（对话流仍为 mock）
- 邮箱 + 密码登录：MySQL 用户 + scrypt 密码 hash + `auth_sessions` + HttpOnly Cookie
- Web BFF：登录、登出、me、知识库/文档/ACL 请求统一转发，浏览器不直连 API/RAGFlow
- 知识库管理 UI：列表、详情、文档状态、默认访问范围、设置；列表/详情/文档/ACL 读写已接真实 API
- 文档权限 UI：ACL 抽屉、有效人数、访问检查；有效人数与访问判定来自服务端，批量授权入口保留但未接入
- 成员与组 UI：本地数据库只读成员/用户组、详情抽屉（仍为 mock 数据）
- 审计日志 UI：事件流、筛选、详情（页面仍为 mock；ACL 变更已真实写入 `audit_logs`）
- 模型配置 UI：OpenCode Go / DeepSeek 官方；配置按用户保存在服务端，API Key 使用 AES-256-GCM 加密，浏览器只拿脱敏值
- 文档上传 UI：真实 multipart 上传、逐文件状态、每 3 秒轮询 `pending`/`parsing`、失败文档重新解析
- NestJS + Fastify API：认证、知识库、文档上传/重试、ACL、访问检查、用户级模型配置
- MySQL 8 Schema 与迁移：租户、用户、组、知识库、文档、ACL、会话、消息、审计、模型配置
- 可重复 seed：1 租户、14 用户、6 组、4 知识库、16 文档，密码 `123456`
- 文档 ACL 策略：知识库默认 + 文档例外、deny 优先、`tenant_admin` 覆盖；16 个单测
- 测试：ACL 16、API 30、Worker 7、RAGFlow client 3，共 56 个
- `packages/queue`：统一队列名、Job 类型与 Redis 连接参数；Worker 接通 RAGFlow 上传/解析轮询
- Fastify Agent Runtime 骨架、RAGFlow 客户端、共享 SSE 协议、ADR

尚未实现：

- 真实 RAGFlow 上传/解析 E2E（本机 Redis 与 RAGFlow 不可用；代码和单测已完成）
- SSE 对话接口、Agent Runtime 工具 `kb.search` / `kb.read`
- 本地成员/组编辑、密码重置、审计查询 API 与审计页接真
- 知识库创建/删除、文档删除、批量授权
- 生产硬化：CSRF、限流、日志、部署
- MCP / CLI / 多租户 SaaS

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
Copy-Item apps/web/.env.local.example apps/web/.env.local
pnpm install
pnpm db:push
pnpm db:seed

# 只启动 API + Web（UI 联调）
pnpm --filter @pichat/api dev
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

文档上传需要 Redis（`REDIS_URL`）。Worker 还需要 `RAGFLOW_BASE_URL`、`RAGFLOW_API_KEY` 和 `RAGFLOW_DEFAULT_EMBEDDING_MODEL`；缺少时会明确报错，不会伪造解析成功。

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

任务 C 使用 Node 22.23.3 + 本机 MySQL 验证通过：

- `pnpm test`：56 个测试通过（ACL 16 + API 30 + Worker 7 + RAGFlow client 3）
- `pnpm typecheck`：9 个 workspace 包全部通过（Turbo `--concurrency=1`）
- `pnpm lint`：9 个 workspace 包全部通过
- `pnpm build`：Web、API、Runtime、Worker 与共享包全部通过
- `pnpm db:generate` 生成 `0002_absent_strong_guy.sql`；`pnpm db:push` 应用成功
- 模型配置 HTTP 验证：创建/列表/更新省略 Key/设为默认/删除；响应不含明文或密文字段
- Web BFF 验证：登录、模型配置增删查、multipart 上传转发
- Redis 未启动时上传返回 `503 service_unavailable`，文档保留为 `failed`；非法扩展名返回 `400`
- 真实 RAGFlow 解析未验证：本机 6379/9380 不可达，`RAGFLOW_API_KEY` 为空、`RAGFLOW_DEFAULT_EMBEDDING_MODEL` 未配置

UI 视觉、响应式和明暗主题仍待人工验收。`pnpm check` 目前会对 `packages/db/drizzle/meta/*.json` 报 Biome 格式差异，`pnpm lint` 通过。

## 下一步

1. 配置 Redis 7 与可用 RAGFlow（API Key、embedding 模型），补真实上传 → `pending → parsing → ready` E2E。
2. Agent Runtime + SSE 对话 + `kb.search` / `kb.read`。
3. 本地成员/组编辑、密码重置、审计查询 API 与审计页接真。
4. 生产硬化：CSRF、限流、日志、迁移与部署。
