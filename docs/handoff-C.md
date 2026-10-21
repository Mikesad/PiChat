# 任务 C Handoff：服务端模型配置 + 文档上传/入库

> 分支：`feat/model-config-ingestion`
> 基线：`master`（9766d06）
> 代码提交：`0e13658`
> 日期：2026-10-21

## 1. 完成内容

### 1.1 用户级模型配置

- Schema：`model_configs.is_default`，迁移 `packages/db/drizzle/0002_absent_strong_guy.sql`。
- 加密：`apps/api/src/common/model-config-crypto.ts`，AES-256-GCM，格式 `v1:<iv>:<tag>:<ciphertext>`；密钥只读 `MODEL_CONFIG_ENCRYPTION_KEY`。
- API：
  - `GET /api/model-configs`
  - `POST /api/model-configs`
  - `PUT /api/model-configs/:id`（`apiKey` 省略/空字符串保留旧 Key）
  - `DELETE /api/model-configs/:id`
  - `POST /api/model-configs/:id/default`
- `tenantId`、`userId` 只来自 session；所有查询带 `tenant_id + user_id`。
- 响应只含 `hasApiKey`、`apiKeyMasked`，不返回 `encryptedApiKey`、明文或密文。
- provider 定义与默认 Base URL 迁入 `packages/shared/src/model-config.ts`，Web/API 共用。
- Web：
  - `ModelConfigProvider` 改为拉取服务端配置，移除了 localStorage 元数据与 sessionStorage Key。
  - 抽屉支持新增、编辑（Key 留空不修改）、删除、设为默认、显示服务端错误与脱敏 Key。
  - Composer 使用服务端配置与默认模型；无配置显示“尚未配置模型”。

### 1.2 文档上传、Worker、RAGFlow 轮询

- Schema：`documents.size_bytes/mime_type/error_message`。
- `DocumentSummary` 增加 `mimeType`、`errorMessage`；`sizeLabel` 由服务端格式化。
- API：
  - `POST /api/knowledge-bases/:id/documents`：`@fastify/multipart` 流式落盘，扩展名 + MIME 白名单，20MB 默认上限，文件名清洗与路径穿越防护。
  - `POST /api/documents/:id/reparse`：重置 `pending`、清空错误并入队。
  - 上传/重试仅 `tenant_admin`、`knowledge_admin`；其他角色 403。
- 存储：`UPLOAD_DIR/<tenantId>/<knowledgeBaseId>/<documentId>/<safeFileName>`。
- 队列：新增 `packages/queue`，统一 `INGESTION_QUEUE`、`IngestionJob`、Redis 连接参数与 Job 选项。
- Redis 不可用：上传返回 `503 service_unavailable`，文档保留为 `failed` 并写入可读 `error_message`，不会静默丢任务。
- RAGFlow client：`get/createDataset`、`uploadDocument`、`parseDocuments`、`get/listDocument`、`deleteDocument`；multipart 不强制 JSON `Content-Type`。
- Worker：
  - 消费 BullMQ `ingestion` 队列。
  - 数据集不存在时按 `RAGFLOW_DEFAULT_EMBEDDING_MODEL` 创建并回写 `knowledge_bases.ragflow_dataset_id`。
  - 上传后写 `ragflowDocumentId`、`status=parsing`，轮询到 `ready`/`failed`。
  - 已 `ready` 跳过；已有 `ragflowDocumentId` 时只轮询、不重复上传；重新解析的 `pending` 文档会先重启 RAGFlow 解析。
  - 缺少 embedding 配置、源文件缺失、RAGFlow 失败均写 `error_message` 并置 `failed`。
- Web：
  - `UploadDrawer` 真实 `FormData` 逐文件上传，显示上传中/失败原因，成功后刷新列表。
  - 文档列表存在 `pending`/`parsing` 时每 3 秒轮询刷新。
  - 失败文档“重新解析”接真实 API。
  - 失败原因显示在文档行；`sizeLabel` 使用服务端值。

## 2. 执行的命令与真实结果

| 命令 | 结果 |
| --- | --- |
| `pnpm db:generate` | 生成 `0002_absent_strong_guy.sql` 与 snapshot |
| `pnpm db:push` | 非 TTY 环境触发交互式确认失败；改用 `pnpm --filter @pichat/db exec drizzle-kit push --force` 成功应用 4 个列变更 |
| `pnpm exec turbo run typecheck --concurrency=1` | 14/14 tasks 成功（9 个 workspace） |
| `pnpm lint` | 9/9 包通过 |
| `pnpm exec turbo run test --concurrency=1` | 9/9 tasks 成功；56 个测试通过 |
| `pnpm exec turbo run build --concurrency=1` | 9/9 tasks 成功（Web/API/Runtime/Worker/共享包） |

说明：本机虚拟内存偏紧，Turbo 默认并行可能 OOM；以上结果使用 `--concurrency=1` 和 `NODE_OPTIONS=--max-old-space-size=2048`。

自动化测试分布：

- ACL 纯策略：16
- API：30（密码、session、ACL、模型配置加密/隔离/默认唯一、上传权限/类型/大小/路径清洗）
- Worker：7（ready 跳过、已有 RAGFlow 文档只轮询、重新解析重启 RAGFlow 解析、数据集创建+上传+解析、失败写错误、缺 embedding、源文件缺失）
- RAGFlow client：3（multipart Content-Type、状态映射、列表解析）

## 3. 真实 HTTP 验证

使用生产构建启动 API（3001）与 Web（3000），通过 MySQL 本机库验证：

- `POST /api/auth/login` 张明登录成功。
- 模型配置：创建 → 列表 → 更新（省略 apiKey）→ 设为默认 → 删除（204）全部成功。
- 响应不含明文 Key，也不含 `encrypted` 字段；`apiKeyMasked=****9999/****7777`。
- Web BFF：登录、模型配置增删查转发成功。
- Redis 未启动时上传：API 与 Web BFF 都返回 `503 service_unavailable`，响应体为明确中文错误。
- 非法 `.exe` 上传返回 `400 invalid_request`。
- 上传记录落库为 `failed`，`mimeType`、`sizeLabel`、`errorMessage` 正确；测试文档与文件已清理。

## 4. Redis / RAGFlow 状态

- Redis `127.0.0.1:6379`：**不可用**。
- Docker Desktop 守护进程：**未启动**；`docker compose ... up -d redis` 报无法连接 Docker API。
- RAGFlow `127.0.0.1:9380`：**不可用**。
- `.env` 中 `RAGFLOW_API_KEY` 为空；`RAGFLOW_DEFAULT_EMBEDDING_MODEL` 未配置。

因此**未执行**真实上传 → `pending → parsing → ready` E2E，也没有伪造通过。Worker 的创建数据集/上传/解析轮询仅由单元/集成测试中的 fake client 覆盖。

## 5. 配置说明

- 根 `.env` 已本地生成 `MODEL_CONFIG_ENCRYPTION_KEY`（32 字节 base64），未打印、未提交。
- `.env.example` 只放 `MODEL_CONFIG_ENCRYPTION_KEY=`、`RAGFLOW_DEFAULT_EMBEDDING_MODEL=` 等占位符。
- `UPLOAD_DIR` 使用 `D:\PiChat\uploads`（不存在时 API 自动创建租户/KB/文档子目录）。
- 可选变量：`UPLOAD_MAX_BYTES`、`RAGFLOW_POLL_INTERVAL_MS`、`RAGFLOW_POLL_TIMEOUT_MS`、`RAGFLOW_POLL_MAX_ATTEMPTS`。

## 6. 未完成 / 阻塞 / 需确认

1. **阻塞**：本机 Redis/RAGFlow 不可用，真实解析 E2E 未做。需要用户提供可用 `RAGFLOW_API_KEY` 与 `RAGFLOW_DEFAULT_EMBEDDING_MODEL`，并启动 Redis。
2. **待真实环境确认**：RAGFlow client 按常见 v1 API 实现：
   - `GET/POST /api/v1/datasets`
   - `POST /api/v1/datasets/:id/documents`
   - `POST /api/v1/datasets/:id/chunks` 启动解析
   - `GET /api/v1/datasets/:id/documents`
   不同 RAGFlow 版本的响应字段（`datasets`/`docs`/`documents`）已做兼容，但未在真实部署核对。
3. 未实现文档删除 UI/接口、知识库创建/删除、批量授权（按任务文档不在范围）。
4. 未做真实 RAGFlow 上传的 multipart 大文件/超时验证；上传 API 的 20MB 限制由 `@fastify/multipart` 与应用层双重校验。
5. 未新增 HTTP 层自动化 multipart 测试；已用真实 API + Web BFF 手动验证 503/400 路径。

## 7. 提交记录

- 代码与文档提交：`0e13658`（`feat: add encrypted model config and document ingestion`）。
- Handoff 补全提交：本文件更新后的提交，见分支 `feat/model-config-ingestion` 顶端。
- 未合并 `master`，等待审核。


