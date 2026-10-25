<div align="center">

# PiChat

**权限感知的企业知识库 Agent**

把企业文档变成可对话的知识库，同时确保每一次回答都只来自你有权阅读的内容。

![status](https://img.shields.io/badge/status-MVP-orange?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-22.22.3%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-10.8-F69220?style=flat-square&logo=pnpm&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?style=flat-square&logo=nestjs&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?style=flat-square&logo=mysql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-FF4438?style=flat-square&logo=redis&logoColor=white)
![RAGFlow](https://img.shields.io/badge/RAGFlow-Retrieval-FF6A00?style=flat-square)

[产品定位](#产品定位) · [功能特性](#功能特性) · [技术栈](#技术栈) · [架构](#架构) · [UI 预览](#ui-预览) · [快速开始](#快速开始) · [项目状态](#项目状态)

</div>

> **项目状态**：MVP 核心链路已完成。真实 RAGFlow 解析/检索、文档级 ACL、在线预览与 SSE 对话流均已验证；真实 LLM 的 RAG 回答与引用 E2E 仍需在管理端配置可用对话模型后跑通。

---

## 产品定位

PiChat 是一个面向企业的 **权限感知 RAG 知识库 Agent**。员工用自然语言提问，Agent 只在当前用户有权阅读的文档中检索，以流式方式返回回答、思考过程、工具调用和可追溯的引用。

它不是「文档上传 + 向量检索」的演示壳，而是把 **ACL 作为检索硬约束**：权限在检索前计算、检索后复核、引用展示前再复核，历史消息中的引用也会按当前权限重新校验。

| 维度 | 说明 |
| --- | --- |
| 目标用户 | 拥有内部文档资产、需要部门/文档级权限隔离的企业与团队 |
| 核心问题 | 通用 RAG 方案能解决「查得到」，但很难保证「只查该查的」；权限容易散落在提示词、前端或向量库中 |
| 解决方式 | MySQL 中的 ACL 是唯一事实源，贯穿知识库、文档、检索、引用与历史消息全链路 |
| 典型场景 | 内部制度、研发文档、售后知识库、财务/合规资料、部门专属资料库 |
| 产品边界 | 不自建向量库，不使用 RAGFlow Chat/Agent；RAGFlow 仅作为解析与检索引擎 |

### 为什么不是普通 RAG 套壳

- **权限是硬约束，不是提示词。** 检索请求必须同时携带服务端计算的 `dataset_ids` 与 `document_ids`，模型无法通过参数扩大范围。
- **引用可追溯、可预览。** 回答中的引用可打开 PDF、DOCX、MD、TXT 原文，并支持单段 Range 预览。
- **配置可治理。** 对话模型、Embedding、ReRank 与联网搜索由管理员按租户统一维护，成员直接使用。
- **运行时隔离。** Pi 内置的 `read` / `write` / `edit` / `bash` 全部禁用，只注册知识库工具；每个会话使用独立空目录与 JSONL 持久化。

---

## 功能特性

### 权限与安全

- 用户最多归属一个部门；知识库与文档支持用户/部门两级 ACL，`allow` / `deny` 同时存在时 deny 优先。
- 文档支持 `acl_mode`：`inherit` 继承知识库权限，`restricted` 需额外命中文档级 `read`。
- 知识库级 `deny` 覆盖文档级 `read`；`tenant_admin` 始终可读。
- 判定顺序固定为：账号启用 → 知识库访问资格 → 文档模式 → 文档级 ACL → 异常默认拒绝。
- 检索全链路复核：`allowedDocumentIds` → RAGFlow `dataset_ids` + `document_ids` → 检索后复核 → 引用展示前复核。
- 历史消息引用在返回前按当前 ACL 重新校验，不可读引用不会返回。
- 审计日志覆盖 ACL、文档、知识库、成员与配置变更；模型与搜索 API Key 使用 AES-256-GCM 加密存储。
- API ↔ Runtime 只通过 `INTERNAL_SHARED_SECRET` 保护的 `/internal/*` 接口通信。

### 对话体验

- 真实 SSE 流式回答，展示思考过程、工具调用、引用与 usage。
- 引用面板与回答下方引用 chip 均可打开原文预览，支持 PDF、DOCX、MD、TXT。
- 支持停止生成与失败重试；重试不会重复插入用户消息。
- 对话可按会话多选目标知识库；默认全选，空选表示只做通用回答。
- 明暗主题与移动端适配。

### 知识库与文档

- 知识库创建时同步创建 RAGFlow dataset，失败返回 503 且不写半成品数据。
- 支持 PDF、DOCX、MD、TXT 上传；BullMQ + Worker 负责入库、RAGFlow 解析轮询、失败重试与状态刷新。
- 知识库与文档采用软删除，后台清理本地文件、RAGFlow 资源与队列任务。
- 同库多文档批量授权（整体替换例外），知识库级允许/禁止名单。
- 知识库可配置 Top-K、相似度阈值、向量权重；Embedding 与 ReRank 来自企业共享配置。
- 文档列表展示解析状态、文件类型、所属部门；文档标题与引用均可直接预览原文。

### Agent Runtime

- 基于 `@earendil-works/pi-coding-agent` 1.3.0，禁止所有内置编码工具，只注册知识库工具。
- 六个知识库工具：`kb_search`、`kb_read`、`kb_list_scope`、`kb_read_around`、`kb_find_in_document`、`kb_document_outline`。
- `kb_read` 只接受 `kb_search` 返回的引用序号，不接受模型传入的 `documentId`。
- 每会话独立空 `cwd` 与 Pi JSONL 会话目录；模型 Key 只在单次 run 内存中出现。
- 对话目标知识库只能收窄检索范围，模型参数不能扩大服务端 ACL scope。

### 模型、Embedding 与联网搜索

- 对话、Embedding、ReRank 配置按租户共享，由管理员维护；成员可在对话中选择对话模型。
- 模型配置响应只返回脱敏 Key 与创建人，明文不进入浏览器、日志或 SSE。
- Embedding 配置接入知识库创建；ReRank 通过 RAGFlow `rerank_id` 接入检索。
- 联网搜索基于 `pi-web-access` 进程内扩展，按单次请求开关，只开放 `web_search`；支持 Tavily 与 HTTP 代理。
- 管理端提供模型配置、搜索引擎、测试连接与设为默认。

### 管理端

- 成员与部门：查询、角色/状态/部门编辑、密码重置、最后管理员保护。
- 知识库设置、文档权限、批量授权、在线预览、解析状态与失败重试。
- 审计日志查询与筛选；模型、搜索引擎与知识库列表统一分页。
- 无权限页面在侧边栏显示锁定状态，受限页面不会渲染或请求接口。

---

## 技术栈

| 层级 | 选型 |
| --- | --- |
| 运行时 | Node.js 22.22.3+、TypeScript 5.9 |
| Monorepo | pnpm workspace、Turborepo |
| Web | Next.js 15、React 19、Tailwind CSS 4、react-markdown、docx-preview |
| BFF | Next.js Route Handlers，浏览器不直连 API / RAGFlow |
| API | NestJS 12、Fastify 5（CommonJS） |
| Agent Runtime | Fastify、`@earendil-works/pi-coding-agent` 1.3.0（ESM） |
| RAG | RAGFlow Retrieval / Dataset / Document API |
| 元数据 | MySQL 8、Drizzle ORM |
| 队列与缓存 | Redis 7、BullMQ |
| 文档存储 | 本地磁盘（MVP），后续可扩展 S3 / MinIO |
| 鉴权 | 邮箱 + 密码、scrypt、HttpOnly Session、sha256 token |
| 加密 | AES-256-GCM（模型与搜索 API Key） |
| 工具链 | Biome、Vitest、tsup |

---

## 架构

```mermaid
flowchart LR
    Browser["Browser"]
    Web["Next.js 15<br/>UI + BFF"]
    API["NestJS API<br/>Auth / ACL / Chat"]
    DB[("MySQL 8<br/>Tenant / ACL / Messages")]
    Redis[("Redis 7<br/>BullMQ")]
    Runtime["Agent Runtime<br/>Pi SDK 1.3.0"]
    Worker["Worker<br/>解析轮询"]
    RAGFlow[("RAGFlow<br/>解析 + 检索")]

    Browser --> Web
    Web --> API
    API --> DB
    API --> Redis
    API -->|"内部 /internal/*"| Runtime
    Runtime -->|"ACL scope / check"| API
    Runtime --> RAGFlow
    Redis --> Worker
    Worker --> RAGFlow
```

**关键边界**

- `apps/web` 只负责 UI 和 BFF，不直连 RAGFlow，也不持有任何 API Key。
- `apps/api` 负责认证、租户、ACL、会话与产品消息落库。
- `apps/agent-runtime` 负责 Pi Agent Loop、工具、SSE 与 JSONL 会话，不写聊天消息表。
- `apps/worker` 负责文档入库与 RAGFlow 解析轮询，不参与在线对话。
- `packages/access-control` 是纯 ACL 策略包，不依赖数据库，便于单测。

---

## 权限模型

### 判定顺序

```text
账号启用
  → 知识库访问资格（用户/部门，deny 优先）
  → 文档 acl_mode（inherit / restricted）
  → 文档级 ACL（deny 优先）
  → 默认拒绝（tenant_admin 例外）
```

### 检索链路

```text
计算 allowedDocumentIds
  → RAGFlow dataset_ids + document_ids
  → 检索结果 ACL 复核
  → 引用展示前再复核
```

开源 RAGFlow 的权限只到 dataset 级，因此 PiChat 自己实现文档级授权；知识库默认 ACL 动态计算，不物化到文档 ACL。ACL 缓存 key 包含 `tenantId + knowledgeBaseId + aclVersion + userId + departmentId`，权限变更后下一次工具调用立即生效。

---

## UI 预览

> 以下为截图占位，后续替换为 `docs/images/*.png` 即可。

<img width="1912" height="914" alt="%1Z2U%3B S E )J9 BWE(7Y" src="https://github.com/user-attachments/assets/ac3252db-bffc-4aa0-bd2e-774e641018b1" />
<img width="1912" height="914" alt="7 `U5HGXT)44Y4M~NNUM5OW" src="https://github.com/user-attachments/assets/b5baa885-1854-4ca2-ab5a-5680e04566c9" />
<img width="1912" height="914" alt="88WK8LQ5MC$@LDGBX8 M05Y" src="https://github.com/user-attachments/assets/8ef3ef56-bf3a-4ae8-94f0-b914e0ebf292" />


---

## 环境要求

| 依赖 | 版本 / 要求 | 用途 |
| --- | --- | --- |
| Node.js | **>= 22.22.3** | Pi SDK 1.3.0 与 Nest CLI 依赖链要求 |
| pnpm | **>= 10.8.0** | workspace 与 lockfile |
| MySQL | 8.0.13+ | 业务元数据、ACL、会话与消息 |
| Redis | 7+ | BullMQ 文档入库队列 |
| RAGFlow | 可访问的独立部署 | 文档解析与向量检索 |
| LLM API Key | OpenAI 兼容 / DeepSeek 等 | 对话模型 |
| Docker | 可选 | 本地 MySQL / Redis / MinIO |

> 仓库启用了 `engine-strict=true`，Node 20 会直接拒绝安装。RAGFlow 不包含在 `infra/docker/compose.dev.yaml` 中，需要独立部署；创建知识库前需在管理端配置 Embedding，并确认 `RAGFLOW_DEFAULT_EMBEDDING_MODEL` 对应模型在 RAGFlow 中可用。

---

## 快速开始

### 1. 克隆与安装

```powershell
git clone https://github.com/Mikesad/PiChat.git
cd PiChat
pnpm install --frozen-lockfile
```

### 2. 创建数据库与账号

```sql
CREATE DATABASE IF NOT EXISTS pichat
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'pichat'@'%' IDENTIFIED BY 'change_me';
GRANT ALL PRIVILEGES ON pichat.* TO 'pichat'@'%';
FLUSH PRIVILEGES;
```

如果使用 Docker Compose，MySQL 会自动创建 `pichat` 库与账号，端口映射为 **3307**，需要相应修改 `DATABASE_URL`。

### 3. 建表（二选一）

**方式 A：Drizzle 推送（开发环境推荐）**

```powershell
# 先完成第 4 步的 .env 配置
pnpm db:push
```

**方式 B：手动执行建表 SQL**

完整 DDL 见下方折叠区，直接导入 MySQL 即可。两种方式不要重复执行；`db:push` 会直接修改数据库，共享或生产环境请使用 `pnpm db:generate` 生成可审查的迁移。

<details>
<summary><strong>展开完整建表 SQL（MySQL 8.0.13+）</strong></summary>

```sql
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `tenants` (
  `id` varchar(36) NOT NULL,
  `name` varchar(120) NOT NULL,
  `slug` varchar(80) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenants_slug_uq` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `departments` (
  `id` varchar(36) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `name` varchar(120) NOT NULL,
  `external_id` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `departments_tenant_name_uq` (`tenant_id`,`name`),
  KEY `departments_tenant_idx` (`tenant_id`),
  CONSTRAINT `departments_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` varchar(36) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `display_name` varchar(120) NOT NULL,
  `role` enum('member','knowledge_admin','security_admin','tenant_admin') NOT NULL DEFAULT 'member',
  `status` enum('active','disabled') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `department_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_tenant_email_uq` (`tenant_id`,`email`),
  KEY `users_tenant_idx` (`tenant_id`),
  KEY `users_department_idx` (`department_id`),
  CONSTRAINT `users_department_id_departments_id_fk` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `users_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `auth_sessions` (
  `id` varchar(36) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `last_used_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_sessions_token_uq` (`token_hash`),
  KEY `auth_sessions_tenant_id_tenants_id_fk` (`tenant_id`),
  KEY `auth_sessions_user_idx` (`user_id`),
  KEY `auth_sessions_expires_idx` (`expires_at`),
  CONSTRAINT `auth_sessions_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `auth_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `knowledge_bases` (
  `id` varchar(36) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `name` varchar(160) NOT NULL,
  `description` text,
  `ragflow_dataset_id` varchar(64) NOT NULL,
  `embedding_model` varchar(120) NOT NULL,
  `acl_version` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `retrieval_top_k` int NOT NULL DEFAULT '6',
  `retrieval_similarity_threshold` double NOT NULL DEFAULT '0.2',
  `retrieval_vector_weight` double NOT NULL DEFAULT '0.3',
  `owner_department_id` varchar(36) DEFAULT NULL,
  `owner_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `knowledge_bases_tenant_name_uq` (`tenant_id`,`name`),
  KEY `knowledge_bases_tenant_idx` (`tenant_id`),
  KEY `knowledge_bases_owner_department_idx` (`owner_department_id`),
  KEY `knowledge_bases_owner_idx` (`owner_id`),
  CONSTRAINT `knowledge_bases_owner_department_id_departments_id_fk` FOREIGN KEY (`owner_department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `knowledge_bases_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `knowledge_bases_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `documents` (
  `id` varchar(36) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `knowledge_base_id` varchar(36) NOT NULL,
  `title` varchar(512) NOT NULL,
  `source_key` varchar(1024) NOT NULL,
  `ragflow_document_id` varchar(64) DEFAULT NULL,
  `status` enum('pending','parsing','ready','failed','deleted') NOT NULL DEFAULT 'pending',
  `content_hash` varchar(64) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `size_bytes` bigint unsigned DEFAULT NULL,
  `mime_type` varchar(120) DEFAULT NULL,
  `error_message` varchar(512) DEFAULT NULL,
  `acl_mode` enum('inherit','restricted') NOT NULL DEFAULT 'inherit',
  PRIMARY KEY (`id`),
  KEY `documents_knowledge_base_id_knowledge_bases_id_fk` (`knowledge_base_id`),
  KEY `documents_tenant_kb_idx` (`tenant_id`,`knowledge_base_id`),
  KEY `documents_ragflow_idx` (`ragflow_document_id`),
  KEY `documents_status_idx` (`status`),
  CONSTRAINT `documents_knowledge_base_id_knowledge_bases_id_fk` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_bases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `documents_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `knowledge_base_acls` (
  `id` varchar(36) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `knowledge_base_id` varchar(36) NOT NULL,
  `subject_type` enum('user','group') NOT NULL,
  `subject_id` varchar(36) NOT NULL,
  `permission` enum('read','deny') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `knowledge_base_acls_uq` (`knowledge_base_id`,`subject_type`,`subject_id`),
  KEY `knowledge_base_acls_tenant_idx` (`tenant_id`),
  KEY `knowledge_base_acls_subject_idx` (`subject_type`,`subject_id`),
  CONSTRAINT `knowledge_base_acls_knowledge_base_id_knowledge_bases_id_fk` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_bases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `knowledge_base_acls_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `document_acls` (
  `id` varchar(36) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `knowledge_base_id` varchar(36) NOT NULL,
  `document_id` varchar(36) NOT NULL,
  `subject_type` enum('user','group') NOT NULL,
  `subject_id` varchar(36) NOT NULL,
  `permission` enum('read','deny') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `document_acls_uq` (`document_id`,`subject_type`,`subject_id`),
  KEY `document_acls_knowledge_base_id_knowledge_bases_id_fk` (`knowledge_base_id`),
  KEY `document_acls_tenant_idx` (`tenant_id`),
  KEY `document_acls_subject_idx` (`subject_type`,`subject_id`),
  CONSTRAINT `document_acls_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `document_acls_knowledge_base_id_knowledge_bases_id_fk` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_bases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `document_acls_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `agent_sessions` (
  `id` varchar(36) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `model_provider` varchar(60) NOT NULL,
  `model_id` varchar(120) NOT NULL,
  `thinking_level` varchar(20) NOT NULL DEFAULT 'medium',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `agent_sessions_user_id_users_id_fk` (`user_id`),
  KEY `agent_sessions_tenant_user_idx` (`tenant_id`,`user_id`),
  KEY `agent_sessions_updated_idx` (`updated_at`),
  CONSTRAINT `agent_sessions_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `agent_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `messages` (
  `id` varchar(36) NOT NULL,
  `session_id` varchar(36) NOT NULL,
  `role` enum('user','assistant','tool','system') NOT NULL,
  `content` text NOT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `messages_session_created_idx` (`session_id`,`created_at`),
  CONSTRAINT `messages_session_id_agent_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `agent_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` varchar(36) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `actor_id` varchar(36) DEFAULT NULL,
  `action` varchar(80) NOT NULL,
  `resource_type` varchar(60) NOT NULL,
  `resource_id` varchar(64) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `audit_logs_tenant_created_idx` (`tenant_id`,`created_at`),
  KEY `audit_logs_resource_idx` (`resource_type`,`resource_id`),
  CONSTRAINT `audit_logs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `model_configs` (
  `id` varchar(36) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `user_id` varchar(36) DEFAULT NULL,
  `provider` varchar(60) NOT NULL,
  `model_id` varchar(120) NOT NULL,
  `display_name` varchar(120) NOT NULL,
  `base_url` varchar(512) DEFAULT NULL,
  `encrypted_api_key` text,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `kind` varchar(20) NOT NULL DEFAULT 'chat',
  PRIMARY KEY (`id`),
  UNIQUE KEY `model_configs_tenant_model_uq` (`tenant_id`,`kind`,`provider`,`model_id`),
  KEY `model_configs_user_idx` (`tenant_id`,`user_id`),
  KEY `model_configs_user_id_users_id_fk` (`user_id`),
  CONSTRAINT `model_configs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `model_configs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `search_configs` (
  `id` varchar(36) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `user_id` varchar(36) DEFAULT NULL,
  `provider` varchar(40) NOT NULL,
  `name` varchar(120) NOT NULL,
  `remark` varchar(500) DEFAULT NULL,
  `encrypted_api_key` text,
  `proxy` varchar(512) DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `search_configs_user_idx` (`tenant_id`,`user_id`),
  KEY `search_configs_default_idx` (`tenant_id`,`user_id`,`is_default`),
  KEY `search_configs_user_id_users_id_fk` (`user_id`),
  CONSTRAINT `search_configs_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `search_configs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

</details>

### 4. 配置环境变量

```powershell
Copy-Item .env.example .env
Copy-Item apps/web/.env.local.example apps/web/.env.local
```

至少确认以下配置：

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | MySQL 连接串，例如 `mysql://pichat:change_me@127.0.0.1:3306/pichat` |
| `REDIS_URL` | Redis 连接串 |
| `MODEL_CONFIG_ENCRYPTION_KEY` | 32 字节随机值的 base64，用于加密模型/搜索 API Key |
| `INTERNAL_SHARED_SECRET` | API 与 Runtime 共用的内部密钥 |
| `AGENT_RUNTIME_DATA_DIR` | Pi JSONL 会话与每会话工作目录 |
| `AGENT_RUNTIME_URL` / `API_INTERNAL_URL` | 内部调用地址 |
| `UPLOAD_DIR` | 文档本地存储目录 |
| `RAGFLOW_BASE_URL` / `RAGFLOW_API_KEY` | RAGFlow 地址与 API Key |
| `RAGFLOW_DEFAULT_EMBEDDING_MODEL` | RAGFlow 中实际可用的 Embedding 模型名 |

生成两个密钥（PowerShell，执行两次）：

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

或使用 OpenSSL：

```bash
openssl rand -base64 32
```

`.env` 与 `apps/web/.env.local` 已被 gitignore，不要提交真实 Key。

### 5. 初始化演示数据

```powershell
pnpm db:seed
```

Seed 会重置 `tenant-demo` 的部门、用户、知识库、文档与 ACL 演示数据，可重复执行。演示账号密码统一为 `123456`：

| 账号 | 角色 | 部门 |
| --- | --- | --- |
| `zhang.ming@example.com` | `tenant_admin` | 平台部 |
| `chen.chen@example.com` | `knowledge_admin` | 产品部 |
| `wang.fang@example.com` | `member` | 售后部 |
| `zhao.min@example.com` | `member` | 财务部 |

> Seed 中的知识库用于权限与 UI 演示，其 RAGFlow 资源是占位数据。要验证真实检索，请在界面新建知识库并上传文档（创建时会同步创建 RAGFlow dataset）。

### 6. 启动依赖

```powershell
# 可选：本地 MySQL / Redis / MinIO，MySQL 映射到 3307
docker compose -f infra/docker/compose.dev.yaml up -d
```

RAGFlow 需要独立部署，并确保 `RAGFLOW_BASE_URL` 可访问。文档上传依赖 Redis；缺少 Redis 或 RAGFlow 时会返回明确错误，不会伪造解析成功。

### 7. 启动应用

```powershell
pnpm dev
```

或按需启动：

```powershell
pnpm --filter @pichat/api dev
pnpm --filter @pichat/agent-runtime dev
pnpm --filter @pichat/worker dev
pnpm --filter @pichat/web dev
```

### 8. 首次配置

1. 使用 `zhang.ming@example.com / 123456` 登录。
2. 打开「模型配置」，添加对话模型并设为默认；需要文档检索时再配置 Embedding 与 ReRank。
3. 打开「搜索引擎」，按需配置 Tavily 并测试连接。
4. 新建知识库，选择 Embedding，上传 PDF/DOCX/MD/TXT，等待解析状态变为 `ready`。
5. 回到对话页提问，观察流式回答、思考、工具调用与引用。

---

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

---

## 目录结构

```text
apps/
  web/                 Next.js 对话界面与 BFF
  api/                 NestJS 网关 / 认证 / ACL / 会话
  agent-runtime/       Pi SDK 运行时、知识库工具、策略
  worker/              BullMQ 文档入库与解析轮询
packages/
  shared/              SSE 协议、领域类型、Zod Schema
  db/                  Drizzle Schema、迁移与 seed
  access-control/      纯 ACL 策略
  queue/               BullMQ 队列名、Job 类型与连接配置
  ragflow-client/      RAGFlow HTTP 客户端
infra/
  docker/              本地 MySQL、Redis、MinIO
  ragflow/             RAGFlow 集成说明
docs/
  adr/                 架构决策记录
  api-contract.md      API 契约
  test-plan-*.md       测试方案与权限矩阵
```

---

## 测试与验证

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

当前共有 **190 个自动化测试**，覆盖 ACL 纯策略、API 会话与 ACL、Runtime faux 集成、知识库工具、Worker 删除竞态、文档预览 Range、成员/审计/模型/搜索配置等。

已完成的真实环境验证：

- RAGFlow 四格式上传、解析与检索：MD / TXT / PDF / DOCX 均达到 `ready`，检索口令全部命中。
- 真实文档级 ACL `deny`：用户从可见变为 `explicit_deny`，内部 scope 立即移除该文档，随后恢复。
- 文档预览：API/BFF 的 `200`、`206`、`416`、`401`、`404`，以及 MD / TXT / DOCX 弹窗渲染与 PDF iframe 加载。
- 模型与搜索配置：加密存储、脱敏响应、租户共享读取、成员写拒绝、跨租户隔离。
- 业务 API + fake OpenAI 手工 E2E：登录 → 创建会话 → SSE 流式回答 → MySQL 消息与 metadata 落库。
- 启动冒烟：API `/api/health`、Runtime `/internal/health`、内部接口无 secret 返回 401、Worker 正常启动。

---

## 项目状态

### 已完成

- [x] pnpm + Turborepo monorepo、共享类型与 SSE 协议
- [x] 邮箱密码登录、HttpOnly 会话、Web BFF
- [x] 知识库、文档、ACL、成员、审计、模型与搜索管理 API 及页面
- [x] 动态 ACL、单部门模型、文档 `acl_mode`、知识库级拒绝
- [x] 文档上传、Worker、RAGFlow 解析轮询与失败重试
- [x] Agent Runtime、六个知识库工具、SSE、Pi JSONL
- [x] 对话历史、停止、重试、思考/工具/引用展示
- [x] 文档在线预览与批量授权
- [x] 企业共享模型配置与 Tavily 联网搜索
- [x] 190 个自动化测试；typecheck / lint / build 通过

### 待完成

- [ ] Agent + 真实 LLM 的完整 RAG 回答与引用 E2E（需可用对话模型）
- [ ] 完整 LLM 联网回答与网页引用 E2E
- [ ] RAGFlow 解析配置（chunk 大小 / 切分方法）修改与批量重新解析
- [ ] 生产硬化：CSRF、限流、日志、部署
- [ ] 工具箱后端接入（当前仅前端预览，配置存在 localStorage）
- [ ] MCP / CLI / 多租户 SaaS

### 已知限制

- 真实 LLM 的 RAG 回答/引用仍待配置模型后验证；RAGFlow 侧的解析与检索已单独验证。
- `pnpm db:seed` 写入的演示知识库使用占位 RAGFlow 资源，仅用于权限与 UI 演示。
- 暂未实现部门增删改（成员编辑中可替换所属部门）。
- 暂无 CI；提交前需本地执行 `pnpm typecheck && pnpm lint && pnpm test`。

---

## 文档

- [当前进度](docs/当前进度.md)
- [核心链路测试方案](docs/test-plan-core.md)
- [知识库 ACL 测试矩阵](docs/test-plan-kb-acl.md)
- [API 契约](docs/api-contract.md)
- [架构决策记录](docs/adr/)
- [RAGFlow 集成说明](infra/ragflow/README.md)
