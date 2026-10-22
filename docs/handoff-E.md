# 任务 E 交接：核心链路验收

> 更新时间：2026-10-22
> 代码状态：`master` 已推送，提交 `7c26939 feat: complete agent runtime, chat, and knowledge base lifecycle`。
> 当前阶段：任务 A/B/C/D/E 代码完成；自动化门禁通过；进入真实环境核心链路验收。

## 1. 已完成，不要重复实现

- 登录与会话、Web BFF、动态 ACL、可重复 seed。
- 用户级模型配置 AES-256-GCM 加密存储。
- 文档上传、BullMQ 入队、Worker RAGFlow 上传/解析轮询、失败重试。
- Agent Runtime：prompt、SSE、`kb_search` / `kb_read`、Pi JSONL、内部 ACL scope/check。
- 业务 API：chat 会话/消息/SSE 代理、MySQL 消息落库、abort/retry。
- 任务 E：知识库同步创建、知识库软删除、文档软删除、同库多文档批量授权、审计、队列取消、Worker 删除竞态防护。

## 2. 自动化结果（已执行）

| 项目 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 通过 |
| `pnpm test` | 89 个测试通过 |
| `pnpm build` | 通过 |
| MySQL 3306 / Redis 6379 / RAGFlow 9380 | 均可达 |
| RAGFlow 数据集接口 | `code=0` |
| API `/api/health` | 200 |
| Runtime `/internal/health` | 200 |
| API 内部接口无 secret | 401 |
| Worker | `worker_started` |
| 数据库 `model_configs` | 0 条；Agent 真实 LLM 回答需先配置模型 |
| 真实 E2E：MD/TXT | 建库→上传→解析→RAGFlow 检索全部通过，2 个口令命中，删除 204 |
| 真实 E2E：PDF/DOCX | 建库→上传→解析→RAGFlow 检索全部通过，2 个口令命中，删除 204 |
| 真实 ACL | 王芳访问 `doc-travel`：临时 deny 后 `explicit_deny`，内部 scope 不含该文档；已恢复原状 |

> 自动化阶段临时启动的服务已停止，E2E 临时知识库/文件已清理，没有遗留后台进程。
>
> 注意：当前数据库里 `doc-travel` 原本没有 deny 规则（与 seed 文档描述不一致，可能是之前手工测试改动）。ACL 自动化采用“临时加 deny → 验证 → 恢复空例外”，没有重置用户数据。

## 3. 下一步

文件上传/解析与 RAGFlow 检索已由自动化覆盖；剩余人工确认主要依赖真实 LLM 和 UI：

1. 启动 API、Runtime、Worker、Web。
2. 在 UI 左下角账号菜单配置真实模型并设为默认（当前 `model_configs` 为 0）。
3. 用 Agent 提问 4 个唯一口令，确认 `kb_search` 被调用、回答命中、引用指向正确文档。
4. 通过 UI 验证 ACL deny/撤销、批量授权、文档/知识库删除的交互与确认弹窗。
5. 最后执行 P1 故障与竞态用例。
6. 每完成一个阶段，更新 `docs/当前进度.md` 的完成度、Mock/真实边界与变更记录。

## 4. 可直接粘贴给新会话的交接提示词

```text
你是 PiChat 项目的新会话，负责真实环境核心链路验收。

先按顺序阅读：
1. AGENTS.md
2. docs/当前进度.md
3. docs/test-plan-core.md
4. docs/api-contract.md 第 14 节
5. docs/handoff-E.md
6. docs/adr/0004-agent-runtime-jsonl.md
7. docs/adr/0005-knowledge-base-lifecycle.md

当前状态：
- master 已推送，最新提交 7c26939。
- 任务 A/B/C/D/E 代码已完成，不要重复实现。
- 自动化门禁已通过：typecheck、lint、89 个测试、build。
- MySQL 3306、Redis 6379、RAGFlow 9380 均可达；RAGFlow 数据集接口 code=0。
- API 健康 200，Runtime 健康 200，内部接口无 secret 返回 401，Worker 可启动。
- 数据库 model_configs 当前为 0 条，真实 LLM/RAG 未验证，需要先配置模型。

你的任务：
1. 启动 API、Runtime、Worker、Web。
2. 按 docs/test-plan-core.md 第 4 节执行人工确认：
   - 配置真实 LLM 并设为默认；
   - 创建 E2E 知识库，上传 PDF/DOCX/MD/TXT；
   - 等全部 ready 后验证 4 个唯一口令都能被 RAG 命中并返回正确引用；
   - 验证 ACL deny、即时撤销、批量授权；
   - 验证文档/知识库删除后的 DB、本地目录、RAGFlow、队列清理；
   - 最后跑 P1 竞态与故障用例。
3. 记录每一步证据和失败原因；不要用健康检查通过推断业务链路通过。
4. 完成后更新 docs/当前进度.md，不要伪造成功。

硬约束：
- tenantId/userId 只来自 session；所有查询带 tenant_id。
- ACL 变更必须递增 acl_version 并清缓存；检索前后都要复核。
- 删除失败不回滚 DB，但必须写审计/日志，不能假成功。
- 不提交 commit，除非用户明确要求。
- 登录流程不作为本次验收重点，直接使用已登录会话或种子账号。

关键文件：
- 测试方案：docs/test-plan-core.md
- 交接记录：docs/handoff-E.md
- 知识库服务：apps/api/src/modules/knowledge-bases/
- Worker：apps/worker/src/jobs/ingest.ts
- Runtime：apps/agent-runtime/src/
- Web 管理端：apps/web/components/admin/
```

## 5. 常用命令

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build

pnpm --filter @pichat/api dev
pnpm --filter @pichat/agent-runtime dev
pnpm --filter @pichat/worker dev
pnpm --filter @pichat/web dev
```

本机 `next dev` 可能因内存崩溃；需要稳定 UI 时使用：

```powershell
pnpm --filter @pichat/web build
pnpm --filter @pichat/web start
```
