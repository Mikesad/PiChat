# PiChat 核心链路测试方案

> 更新时间：2026-10-22
> 范围：Agent Runtime、LLM 配置、RAG 检索、ACL、文件上传与解析、知识库生命周期、删除清理。
> 不测试：登录流程、注册/改密、部门成员编辑、审计查询页、UI 视觉细节。
> 原则：**少而全**。自动化先跑，人工只验证自动化无法覆盖的外部依赖与真实体验。

## 1. 测试目标

1. Agent Runtime 能启动、接受内部请求、只暴露知识库工具。
2. 用户级 LLM 配置能真实驱动一次对话，API Key 不出服务端。
3. 上传 PDF/DOCX/MD/TXT 后能完成解析，并在权限允许时被检索和引用。
4. ACL 默认范围、文档级权限、deny 优先级、即时撤销在真实检索链路中生效。
5. 知识库/文档创建、批量授权、删除、清理和审计可重复执行且不产生“假成功”。

## 2. 环境前置

| 项 | 要求 |
| --- | --- |
| MySQL | `127.0.0.1:3306/pichat` 可连接，已执行 `pnpm db:seed` |
| Redis | `127.0.0.1:6379` 可连接 |
| RAGFlow | `RAGFLOW_BASE_URL` 可达，`RAGFLOW_API_KEY` 有效 |
| Embedding | `RAGFLOW_DEFAULT_EMBEDDING_MODEL` 已配置，且与 RAGFlow 部署一致 |
| Runtime | `INTERNAL_SHARED_SECRET`、`AGENT_RUNTIME_DATA_DIR`、`AGENT_RUNTIME_URL`、`API_INTERNAL_URL` 已配置 |
| 上传 | `UPLOAD_DIR` 存在且可写 |
| LLM | 至少一个真实可用的模型配置（在 UI 左下角账号菜单中创建并设为默认） |

> 当前开发机自动化实测：MySQL/Redis/RAGFlow 端口均可达，RAGFlow 数据集接口返回 `code=0`；但数据库 `model_configs` 为 0 条，因此真实 LLM 对话/RAG 需先人工配置模型。

## 3. 自动化阶段（先执行）

### 3.1 代码与集成测试门禁

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

通过标准：

- typecheck：9 个 workspace 全部通过。
- lint：9 个 workspace 全部通过。
- test：95 个测试通过（ACL 16、API 54、Runtime 5、Shared 3、Worker 10、RAGFlow client 7）。
- build：9 个 workspace 全部通过（含 `next build`）。

### 3.2 环境与启动冒烟

```powershell
# 依赖端口
Test-NetConnection 127.0.0.1 -Port 3306
Test-NetConnection 127.0.0.1 -Port 6379
Test-NetConnection 127.0.0.1 -Port 9380

# 启动（分别开终端）
pnpm --filter @pichat/api dev
pnpm --filter @pichat/agent-runtime dev
pnpm --filter @pichat/worker dev
pnpm --filter @pichat/web dev
```

通过标准：

| 检查 | 期望 |
| --- | --- |
| `GET http://127.0.0.1:3001/api/health` | 200 |
| `GET http://127.0.0.1:3002/internal/health` | 200 |
| `POST http://127.0.0.1:3001/internal/access/scope` 无 secret | 401 |
| Worker 日志 | 出现 `worker_started`，无 Redis 连接错误 |
| Web | `http://localhost:3000` 可打开 |

### 3.3 本次自动化结果（2026-10-22）

| 项目 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过，14/14 tasks |
| `pnpm lint` | 通过，9/9 packages |
| `pnpm test` | 通过，89 tests |
| `pnpm build` | 通过，9/9 packages |
| MySQL 3306 / Redis 6379 / RAGFlow 9380 | 均可达 |
| RAGFlow 数据集接口 | `code=0` |
| API 健康检查 | 200 |
| Runtime 健康检查 | 200 |
| 内部接口无 secret | 401 |
| Worker 启动 | `worker_started` |
| 模型配置数量 | 0（阻塞真实 LLM，Agent 真实回答待人工配置） |
| Web | 未启动验证（自动化阶段不依赖） |

真实链路自动化（API + Worker + Redis + RAGFlow，临时数据已清理）：

| 用例 | 结果 |
| --- | --- |
| MD + TXT 建库/上传/解析 | 两篇均 `ready`，均有 RAGFlow document id |
| MD + TXT 检索 | RAGFlow `code=0`，2 个 chunk，2 个唯一口令命中 |
| PDF + DOCX 建库/上传/解析 | 两篇均 `ready`（PDF 为最小合法 PDF，DOCX 为合法 OOXML 包） |
| PDF + DOCX 检索 | RAGFlow `code=0`，2 个 chunk，2 个唯一口令命中 |
| 删除临时知识库 | 204，列表不可见，RAGFlow dataset 已删除 |
| ACL deny 即时生效 | 王芳访问 `doc-travel`：变更前 allowed，变更为 deny 后 `explicit_deny`，内部 scope 不含该文档；随后已恢复原状 |

> 自动化阶段临时启动的 API/Runtime/Worker 已停止，E2E 临时知识库与文件已清理。当前 seed 数据中 `doc-travel` 原本没有 deny 规则（与文档描述不一致，可能是之前手工测试改动）；ACL 自动化采用“临时加 deny → 验证 → 恢复空例外”的方式，未重置用户数据。

## 4. 人工确认阶段（自动化之后执行）

### 4.1 测试数据

新建知识库 `E2E-<时间戳>`，上传 4 个文件，每个文件包含唯一口令：

| 文件 | 唯一口令 |
| --- | --- |
| `policy.pdf` | `PICHAT_E2E_PDF_7Q2` |
| `manual.docx` | `PICHAT_E2E_DOCX_8R3` |
| `notes.md` | `PICHAT_E2E_MD_9S4` |
| `faq.txt` | `PICHAT_E2E_TXT_1T5` |

### 4.2 P0 核心用例（必须全过）

> 文件上传/解析/RAGFlow 检索已由自动化覆盖（4 种格式）；人工阶段重点验证 Agent + 真实 LLM 的完整回答与引用，以及 UI 展示。`doc-travel` 当前 seed ACL 与文档描述不一致，权限用例请使用临时 KB 或临时 ACL 变更后恢复。

- [ ] **P0-1 LLM 配置**：张明配置真实模型并设为默认；刷新后仍为默认；响应只有脱敏 Key。
- [ ] **P0-2 Agent 对话**：发送“你好”，SSE 收到 `run.start`、`text.delta`、`run.end(completed)`；MySQL 落 user/assistant 消息。
- [ ] **P0-3 工具边界**：要求执行 `bash`/读本地文件；只允许 `kb_search`/`kb_read`，内置工具被拦截。
- [ ] **P0-4 同步建库**：创建 `E2E-<时间戳>`；RAGFlow 出现 `pichat-<kbId>` dataset；审计 `knowledge_base.create`。
- [ ] **P0-5 多格式上传解析**：PDF/DOCX/MD/TXT 全部 `ready`；非法 `.exe` 返回 400；失败可重新解析。
- [ ] **P0-6 RAG 命中**：分别用 4 个唯一口令提问；答案命中、引用指向正确文档，说明 4 种格式都能被检索。
- [ ] **P0-7 ACL deny**：给王芳 deny `policy.pdf`；王芳提问时 scope/引用不包含该文档，其他 3 篇仍可检索。
- [ ] **P0-8 权限即时撤销**：先给王芳 read，确认可检索；改 deny 后立即重问，引用消失且 `acl_version` 递增。
- [ ] **P0-9 批量授权**：选 3 篇文档整体替换例外；`acl_version` 只 +1；只有一条 `document.acl.batch_update` 审计。
- [ ] **P0-10 删除文档**：软删除后列表/检索不可见；本地目录和 RAGFlow 文档被清理；重复删除 204。
- [ ] **P0-11 删除知识库**：软删除后列表/详情 404、检索无引用；RAGFlow dataset 和本地目录被清理；重复删除 204。

### 4.3 P1 稳定性用例（建议执行）

- [ ] **P1-1 入库删除竞态**：上传后 1 秒内删除文档，等 15 秒；文档保持 deleted，不被 Worker 复活。
- [ ] **P1-2 远端清理失败**：停 RAGFlow 后删除文档/知识库；API 仍 204，审计 `remoteCleanup=failed`。
- [ ] **P1-3 Redis 不可用**：停 Redis 后上传返回 503 且文档 failed；删除仍 204；恢复后无重复解析。
- [ ] **P1-4 Runtime 重启续聊**：同一会话聊一轮，重启 Runtime 后追问；JSONL 恢复上下文。
- [ ] **P1-5 停止与重试**：生成中停止得到 `aborted`；重试不重复插入 user message。

## 5. 证据与判定

必须保留：

- 4 个文件的状态截图或 API 返回（`ready`）。
- 4 次 RAG 回答的引用截图/SSE 片段。
- 王芳 deny 前后 `/internal/access/scope` 或检索结果差异。
- `acl_version`、`audit_logs` 查询结果。
- RAGFlow dataset/document 删除后的截图或 API 结果。

判定：

- P0 全部通过才算核心链路可验收。
- P1 允许出现环境性失败，但必须是明确错误/审计记录，不能伪造成功。
- 任一端出现“接口成功但 DB/RAGFlow 未生效”，按失败处理。

## 6. 推荐执行顺序

1. 自动化门禁（第 3.1 节）。
2. 环境与启动冒烟（第 3.2 节）。
3. 配置 LLM，跑 P0-1/P0-2/P0-3。
4. 创建知识库并上传 4 种格式，等待 ready（P0-4/P0-5）。
5. 跑 P0-6 真实 RAG。
6. 跑 P0-7/P0-8/P0-9 权限。
7. 跑 P0-10/P0-11 删除清理。
8. 最后跑 P1-1 到 P1-5，避免测试数据污染前面的检索与权限用例。
