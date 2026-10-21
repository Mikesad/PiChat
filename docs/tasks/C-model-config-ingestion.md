# 任务 C：服务端模型配置 + 文档上传/入库

> 基线：`master`（第一冲刺已完成）
> 建议分支：`feat/model-config-ingestion`
> 目标：一次会话完成「1. 用户级模型配置 + 服务端加密 Key」和「2. 本地文件上传 + Worker + RAGFlow 解析轮询」。
> 不在本任务内：Agent Runtime、SSE 对话、RAG 检索、成员/审计、生产硬化。

## 0. 开始前

先完整阅读：

- `AGENTS.md`
- `docs/当前进度.md`
- `docs/api-contract.md`
- `packages/db/src/schema.ts`
- `packages/ragflow-client/src/*`
- `apps/api/src/modules/*`
- `apps/web/components/model-config/*`
- `apps/web/components/admin/upload-drawer.tsx`
- `apps/web/components/admin/admin-data.tsx`
- `apps/worker/src/*`

确认：

1. 根 `.env` 存在，数据库 `pichat` 可用。
2. Redis 是否可用（`redis://localhost:6379`）；未启动时先启动 `infra/docker/compose.dev.yaml` 的 Redis。
3. RAGFlow 是否可用（`RAGFLOW_BASE_URL`、`RAGFLOW_API_KEY`）；当前 `.env` 的 API Key 可能为空。
4. 模型加密 Key：在本地 `.env` 增加 `MODEL_CONFIG_ENCRYPTION_KEY`（32 字节随机值的 base64），不要提交；`.env.example` 只放占位符。

如果 Redis/RAGFlow 不可用：**代码、迁移、单测照常完成；不要伪造 E2E 通过**，在 handoff 中明确记录阻塞。

## 1. 范围

### 1.1 服务端模型配置（P0）

#### Schema

- `model_configs` 已包含 `user_id`、`encrypted_api_key`。
- 增加 `is_default boolean not null default false`。
- 保持用户级唯一：`(tenant_id, user_id, provider, model_id)`。
- 生成迁移，不手改已生成 SQL。

#### 加密

- 使用 Node `crypto`，AES-256-GCM。
- 存储格式建议：`v1:<ivBase64>:<tagBase64>:<ciphertextBase64>`。
- 密钥只从 `MODEL_CONFIG_ENCRYPTION_KEY` 读取；缺失时启动或保存配置直接报清晰错误。
- 解密只发生在服务端内部；API 响应、日志、错误信息都不得出现明文 Key 或密文。
- 返回脱敏信息：`hasApiKey`、`apiKeyMasked`（如 `****abcd`）。

#### API

所有接口要求登录；`tenantId`、`userId` 只从 session 获取。

- `GET /api/model-configs`
  - `{ modelConfigs: ModelConfigSummary[] }`
- `POST /api/model-configs`
  - body：`{ provider, modelId, displayName, baseUrl, apiKey, makeDefault? }`
  - 创建当前用户的配置；同一 provider/model 重复返回 409。
- `PUT /api/model-configs/:id`
  - body 同上，但 `apiKey` 可省略；省略时保留旧 Key。
  - 只能改当前用户的配置。
- `DELETE /api/model-configs/:id`
  - 204；只能删当前用户配置。
- `POST /api/model-configs/:id/default`
  - 将该配置设为当前用户默认；事务内清除其他默认。

`ModelConfigSummary`：

```ts
{
  id: string;
  provider: "opencode-go" | "deepseek";
  modelId: string;
  displayName: string;
  baseUrl: string;
  isDefault: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string;
  createdAt: string;
  updatedAt: string;
}
```

- provider 列表和默认 baseURL 复用到 `packages/shared`，避免前后端各维护一份；可迁移 `apps/web/lib/model-config.ts` 的 provider 定义。
- 不要返回 `encryptedApiKey`。

#### Web

- `ModelConfigProvider` 改为请求 `/api/model-configs`；移除 localStorage 元数据和 sessionStorage Key。
- 模型配置抽屉：
  - 已有配置显示脱敏 Key；
  - 编辑时 Key 输入留空表示不修改；
  - 保存/删除/设为默认调用 API；
  - 服务端错误显示出来。
- Composer 的模型选择器使用服务端返回的配置和默认模型。
- 没有配置时显示“尚未配置模型”，不要回退到本地假数据。

#### 测试

- 加密/解密 roundtrip，错误密钥失败。
- 数据库中 `encrypted_api_key` 不含明文。
- API 响应不含 Key/密文。
- 用户隔离：A 用户看不到/改不了 B 用户的配置。
- 默认模型唯一性。

### 1.2 文档上传、Worker、RAGFlow 轮询（P0）

#### Schema

- `documents` 增加：
  - `size_bytes bigint nullable`
  - `mime_type varchar(120) nullable`
  - `error_message varchar(512) nullable`
- `DocumentSummary` 增加 `mimeType`、`errorMessage`；`sizeLabel` 由 `size_bytes` 格式化后返回，不再固定 `null`。
- `knowledge_bases.ragflow_dataset_id` 继续使用；不存在或失效时按下述规则处理。

#### API

- `POST /api/knowledge-bases/:id/documents`
  - `multipart/form-data`，字段名 `file`，一次一个文件。
  - 允许扩展名：`.pdf`、`.docx`、`.md`、`.txt`；可先用扩展名 + MIME 白名单。
  - 最大 20MB，可配置 `UPLOAD_MAX_BYTES`。
  - 存储路径：`UPLOAD_DIR/<tenantId>/<knowledgeBaseId>/<documentId>/<safeFileName>`。
  - 文件名必须清洗，禁止 `..`、路径分隔符和空文件名。
  - 创建文档：`status=pending`、`sourceKey=本地路径`、`sizeBytes`、`mimeType`。
  - 入队 BullMQ job；返回 201 `{ document }`。
  - 需要 `@fastify/multipart`；禁止把文件读入内存后再长期持有。
- `POST /api/documents/:id/reparse`
  - 校验文档属于当前租户且有权限；
  - 重置 `status=pending`、清空 `errorMessage`、入队，返回 `{ document }`。
- 上传/重试权限：`tenant_admin`、`knowledge_admin`；其他角色 403。
- 所有查询显式带 `tenantId`。

#### 队列

- 建议新增 `packages/queue`，统一导出队列名、job 类型和连接配置，供 API 与 Worker 共用。
- 不要让 `apps/api` 从 `apps/worker` 导入运行时实现。
- Redis 不可用时，上传接口返回 503 和明确提示，不要静默丢任务。

#### RAGFlow Client

扩展现有 `packages/ragflow-client`，所有 RAGFlow HTTP 调用集中在这里：

- `createDataset(input)`：不存在时创建数据集。
- `uploadDocument(datasetId, file)`：multipart 上传。
- `getDocument(datasetId, documentId)` 或列表查询：读取解析状态。
- `deleteDocument`（如本轮需要重传/删除）。
- 支持 `FormData`，不要给 multipart 请求强制 `Content-Type: application/json`。

#### Worker

- 接通 BullMQ，消费 `INGESTION_QUEUE`。
- 处理流程：
  1. 读取 job 的 `tenantId/documentId/knowledgeBaseId`，从业务库确认文档和 KB。
  2. 确认数据集：
     - `ragflowDatasetId` 可用则直接使用；
     - 不存在时用 KB 名称 + `RAGFLOW_DEFAULT_EMBEDDING_MODEL` 创建数据集，并把真实 ID 写回 `knowledge_bases.ragflow_dataset_id`；
     - 缺少 embedding 配置时写 `documents.error_message` 并置 `failed`，不要无限重试。
  3. 上传本地文件到 RAGFlow，保存 `ragflowDocumentId`，状态置 `parsing`。
  4. 轮询解析状态（间隔、超时、最大次数可配置），成功后 `ready`，失败写 `error_message` 并置 `failed`。
  5. 幂等：重复 job 不重复上传；已 `ready` 直接跳过；已有 `ragflowDocumentId` 只轮询。
- 记录结构化日志，但不得输出文件内容、API Key、绝对路径中的敏感信息。
- Worker 启动失败要打印明确原因（Redis/RAGFlow/加密配置等）。

#### Web

- `UploadDrawer` 改为真实 `FormData` 上传：
  - 多文件可逐个上传；
  - 显示上传中、失败原因；
  - 成功后刷新文档列表；
  - 关闭时不要伪造成功。
- 文档列表在存在 `pending`/`parsing` 文档时轮询刷新（如每 3 秒），进入 `ready`/`failed` 后停止。
- `失败` 文档的“重试解析”接 `POST /api/documents/:id/reparse`。
- `sizeLabel` 使用服务端返回值；没有大小显示“—”。
- 上传/重试按钮按 `canManageAcl` 或新增的 `canManageDocuments` 控制。
- 不要把 RAGFlow API Key 暴露给浏览器。

## 2. API 响应与错误

沿用现有错误格式：

```json
{ "code": "invalid_request", "message": "请求参数无效", "details": null }
```

新增状态：

- 文件类型/大小/文件名非法：`400 invalid_request`
- 无权限：`403 forbidden`
- 文档/KB 不属于当前租户：`404 not_found`
- Redis 不可用：`503`，`code` 使用 `internal_error` 或新增明确的 `service_unavailable`（需同步 `packages/shared`）
- RAGFlow 调用失败：写文档 `failed` + `error_message`，不要返回 RAGFlow API Key。

## 3. 不在本任务范围

- Agent Runtime、SSE 对话、`kb.search` / `kb.read`。
- RAGFlow 检索。
- 知识库创建/删除/修改。
- 文档删除（除非实现重传必需；先不做 UI）。
- 成员/组、审计查询、模型与对话联动。
- 生产硬化、MCP/CLI/多租户。

## 4. 环境与验证

需要：

- Redis 7（BullMQ Worker）。
- RAGFlow 可达地址 + API Key。
- `UPLOAD_DIR=D:\PiChat\uploads`（不存在时自动创建）。
- `MODEL_CONFIG_ENCRYPTION_KEY`。
- `RAGFLOW_DEFAULT_EMBEDDING_MODEL`（创建数据集时必填；按实际 RAGFlow 部署的 embedding 模型名填写）。

如果 Redis/RAGFlow 缺失：

- 继续完成代码、迁移、单测、构建；
- 在 handoff 中列出未执行的真实上传/轮询验证；
- 不得用假 RAGFlow 响应声称 E2E 通过。

命令：

```powershell
pnpm db:generate
pnpm db:push
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

E2E（有 Redis/RAGFlow 时）：

1. 登录张明。
2. 在知识库页上传一个 PDF/MD。
3. 观察文档 `pending → parsing → ready`。
4. 用王芳登录，确认新文档按 ACL 可见/不可见。
5. 故意上传不支持的文件，确认 400。
6. 停 Redis 后上传，确认 503 且没有丢记录。
7. 检查数据库：`documents.ragflow_document_id`、`status`、`size_bytes`、`error_message`；`model_configs.encrypted_api_key` 不含明文。

## 5. 提交

- 只提交到 `feat/model-config-ingestion`，不要直接改 `master`。
- 写 `docs/handoff-C.md`：
  - 提交 hash；
  - 完成的 API/UI/Worker；
  - 执行过的命令与真实结果；
  - Redis/RAGFlow 是否可用；
  - 未完成/阻塞项；
  - 需要用户确认的配置。
- 更新 `docs/当前进度.md` 和 `README.md` 的对应能力，但不要夸大未验证的部分。
