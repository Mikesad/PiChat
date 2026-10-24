# 知识库权限体系测试方案与演示数据

> 更新时间：2026-10-24
> 适用范围：`apps/api` 知识库/文档 ACL、`packages/access-control`、Web 文档权限页、Agent Runtime 检索范围
> 数据环境：本机 `tenant-demo` + 隔离租户 `tenant-perm-other`

## 1. 测试目标

1. 验证知识库默认 ACL 与文档例外组合后的最终读取结果。
2. 验证 deny 优先级：文档内 deny > 文档 read，知识库 deny > 文档 read。
3. 验证不同角色：`tenant_admin` 覆盖、`knowledge_admin` 只读元数据不隐式获得内容、`member` 严格按 ACL。
4. 验证知识库列表可见性、文档列表、原文件预览、检索范围使用同一套 ACL。
5. 验证权限变更后缓存立即失效，不需要等待重启。
6. 验证跨租户隔离，任何接口都不能越界读取其他租户的知识库、文档或内容。
7. 验证归属部门只用于治理展示，不改变访问权限。

## 2. 判定原则（2026-10-24 升级后）

- **严格顺序**：账号启用 → 知识库访问资格 → 文档 `acl_mode` → 文档 ACL → 异常默认拒绝。
- 一个用户最多属于一个部门（`users.department_id`）；部门授权只匹配该部门，未分配部门不匹配任何部门授权。
- 知识库访问资格 = 部门或用户本人在 `knowledge_base_acls` 中命中 `read`，且没有命中 `deny`；没有资格时，文档级 `read` 也不能放行。
- `documents.acl_mode = inherit`：知识库访问资格即可读；文档级 `deny` 仍然优先。
- `documents.acl_mode = restricted`：除知识库访问资格外，还必须在 `document_acls` 中命中文档级 `read`。
- 文档级 `deny` 覆盖文档级 `read`；知识库级 `deny` 覆盖所有文档级授权。
- `tenant_admin` 对所有本租户文档 `role_override`，但仍受跨租户隔离约束。
- `knowledge_admin` / `security_admin` 可以看文档元数据、管理 ACL，但不会因为角色自动获得内容读取权。
- `knowledge_base_acls` 只代表知识库访问资格，不等于 `restricted` 文档的读取授权。
- ACL/模式变更必须递增 `knowledge_bases.acl_version`，进程内缓存 key 含 `aclVersion + departmentId`。
- 归属部门（`owner_department_id`）和创建者（`owner_id`）是治理元数据，不参与 `decideEffectiveDocumentAccess`。
- 历史消息引用在返回前重新鉴权；权限撤销后旧引用不再返回。

> 下面 4.1–4.3 是旧模型（多组、文档例外可绕过知识库）的历史矩阵，仅保留作对照。新环境请按 4.4 的种子数据用例执行；旧 C 库“无知识库授权但文档例外可读”的用例在新模型下应全部拒绝。

## 3. 测试账号

所有测试账号密码均为 `123456`。

| 账号 | 角色 | 部门 | 用途 |
| --- | --- | --- | --- |
| `zhang.ming@example.com` | `tenant_admin` | `g-platform` | 管理员覆盖、跨租户越权尝试 |
| `wang.fang@example.com` | `member` | `g-support` | 售后默认、restricted 文档拒绝 |
| `zhao.min@example.com` | `member` | `g-finance` | 财务默认、无知识库授权时拒绝 |
| `chen.chen@example.com` | `knowledge_admin` | `g-product` | 产品部默认、无隐式读取权 |
| `perm.outsource@example.com` | `member` | `g-outsource` | 知识库级 deny、文档 read 被 deny 覆盖 |
| `perm.newcomer@example.com` | `member` | `g-outsource` | 未分配有效授权，验证默认拒绝 |
| `perm.other-admin@example.com` | `tenant_admin` | 其他租户 | 跨租户隔离 |

> 后两个成员账号与 `tenant-perm-other` 为本次测试新增；正式环境不要保留。

## 4. 测试数据

### 4.1 知识库矩阵

| 知识库 | 归属部门 | 默认允许 | 默认禁止 | 文档数 | 目的 |
| --- | --- | --- | --- | --- | --- |
| `权限测试-A · 默认全员` | 平台部 | `g-all` | 无 | 2 | 默认全员可读 + 文档级部门 deny |
| `权限测试-B · 默认产品部` | 产品部 | `g-product` | 无 | 3 | 部门默认 + 用户例外 + 用户 deny |
| `权限测试-C · 默认拒绝` | 售后部 | 无 | 无 | 4 | 默认拒绝，仅文档例外可读 |
| `权限测试-D · 知识库禁止` | 平台部 | `g-all` | `g-outsource` | 3 | 知识库级 deny 覆盖文档 read |

四个测试知识库的检索阈值均为 `0.1`，文档均已解析为 `ready`。

### 4.2 文档与预期结果

标记含义：`Y` = 可读，`N` = 拒绝。账号列分别是王芳 / 赵敏 / 陈晨 / 外包成员 / 新人 / 张明。

| Token | 文档 | 所在库 | 文档例外 | 王芳 | 赵敏 | 陈晨 | 外包 | 新人 | 张明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ACLTEST_A1` | A1-继承默认-全员可读.txt | A | 无 | Y | Y | Y | Y | N | Y |
| `ACLTEST_A3` | A3-部门拒绝-售后部.txt | A | `g-support` deny | N | Y | Y | Y | N | Y |
| `ACLTEST_B1` | B1-继承默认-产品部可读.txt | B | 无 | N | N | Y | N | N | Y |
| `ACLTEST_B2` | B2-用户例外-王芳可读.txt | B | `u-wang` read | Y | N | Y | N | N | Y |
| `ACLTEST_B3` | B3-用户拒绝-陈晨.txt | B | `u-chen` deny | N | N | N | N | N | Y |
| `ACLTEST_C1` | C1-无默认无例外.txt | C | 无 | N | N | N | N | N | Y |
| `ACLTEST_C2` | C2-用户可读-赵敏.txt | C | `u-zhao` read | N | Y | N | N | N | Y |
| `ACLTEST_C3` | C3-组可读-售后部.txt | C | `g-support` read | Y | N | N | N | N | Y |
| `ACLTEST_C4` | C4-文档内允许与拒绝-赵敏拒绝.txt | C | `g-all` read + `u-zhao` deny | Y | N | Y | Y | N | Y |
| `ACLTEST_D1` | D1-继承默认-外包被知识库拒绝.txt | D | 无 | Y | Y | Y | N | N | Y |
| `ACLTEST_D2` | D2-文档例外-外包可读但知识库拒绝.txt | D | `g-outsource` read | Y | Y | Y | N | N | Y |
| `ACLTEST_D3` | D3-用户拒绝-王芳.txt | D | `u-wang` deny | N | Y | Y | N | N | Y |

重点断言：

- `ACLTEST_A3`：`g-support` 的文档 deny 覆盖知识库 `g-all` 默认。
- `ACLTEST_B2`：知识库默认不含王芳，但用户级 read 让她可读。
- `ACLTEST_B3`：知识库默认含陈晨，但用户级 deny 覆盖默认。
- `ACLTEST_C1`：知识库无默认、文档无例外，普通成员全部拒绝。
- `ACLTEST_C4`：同一文档内 `g-all` read 与 `u-zhao` deny 并存，赵敏拒绝、其他 `g-all` 成员可读。
- `ACLTEST_D2`：文档给外包部 read，但知识库级 deny 仍然优先，外包成员拒绝。
- 所有行的张明都是 `role_override`，包括 `ACLTEST_B3`、`ACLTEST_C1`。

### 4.3 跨租户数据

| 租户 | 用户 | 知识库 | 文档 |
| --- | --- | --- | --- |
| `tenant-perm-other` | `perm.other-admin@example.com` | `跨租户隔离测试库` | `跨租户隔离测试.txt` |

`tenant-demo` 的账号不能读取该知识库/文档；该租户管理员也不能读取 `tenant-demo` 的测试数据。

### 4.4 新模型种子数据用例

| 场景 | 账号 | 文档 | 预期 |
| --- | --- | --- | --- |
| 知识库默认 + inherit | 王芳（售后） | `内部制度 / 差旅管理制度` | 允许 |
| 知识库默认 + restricted 显式 read | 张明（平台） | `内部制度 / 信息安全管理制度` | 允许 |
| 知识库默认 + restricted 无 read | 王芳（售后） | `内部制度 / 信息安全管理制度` | 拒绝 |
| KB 授权到售后 + 产品 | 王芳（售后） | `售后知识库 / 客户投诉处理 SOP`（restricted，read=售后） | 允许 |
| KB 授权到售后 + 产品 | 陈晨（产品） | `售后知识库 / 客户投诉处理 SOP`（restricted，read=售后） | 拒绝 |
| 无 KB 授权 + 文档 read | 赵敏（财务） | `产品手册 / 定价与折扣策略`（restricted，read=产品） | 拒绝（知识库门禁优先） |
| 账号禁用 | `gu.qiang@example.com` | 任意文档 | 拒绝 |
| 权限查询异常/非法模式 | 任意 | 任意 | 拒绝 |

额外验证：

- 把王芳从 `g-support` 调到 `g-finance` 后，下一次 `kb_search`/引用复核立即使用新部门，不需要等待缓存过期。
- 撤销 `restricted` 文档的 read 后，历史消息里该文档的引用 chip 和 snippet 不再返回。
- 创建知识库后 `owner_id` 记录创建者用户；切换归属部门不影响 ACL。

## 5. 测试用例

### TC-01 知识库列表可见性（P0）

分别登录各账号，请求 `GET /api/knowledge-bases`：

| 账号 | 应看到权限测试库 | 说明 |
| --- | --- | --- |
| 张明 | A/B/C/D | 管理员看全部 |
| 王芳 | A/B/C/D | 四个库各至少一篇可读 |
| 赵敏 | A/C/D | B 没有可读文档，列表隐藏 |
| 陈晨 | A/B/C/D | `knowledge_admin` 不因角色隐藏知识库 |
| 外包成员 | A/C | B 无权限；D 被知识库 deny |
| 新人 | 无 | 不属于 `g-all`，也没有文档例外 |
| 其他租户管理员 | 仅 `跨租户隔离测试库` | 租户过滤 |

### TC-02 文档读取矩阵（P0）

对 12 篇文档逐一调用 `POST /api/access-check`，按 4.2 表核对 `allowed`。重点检查 `reason`：

- 正常授权：`allowed`
- 显式拒绝：`explicit_deny`
- 无授权：`no_grant`
- 管理员：`role_override`

### TC-03 原文件预览权限（P0）

请求 `GET /api/documents/:id/content`，应返回：

| 账号 | 文档 | 预期 |
| --- | --- | --- |
| 王芳 | `ACLTEST_A1` | 200 |
| 王芳 | `ACLTEST_A3` | 404 |
| 陈晨 | `ACLTEST_B1` | 200 |
| 陈晨 | `ACLTEST_B3` | 404 |
| 赵敏 | `ACLTEST_C2` | 200 |
| 王芳 | `ACLTEST_C3` | 200 |
| 外包成员 | `ACLTEST_D2` | 404 |
| 新人 | `ACLTEST_A1` | 404 |
| 张明 | `ACLTEST_B3` | 200 |
| 其他租户管理员 | `ACLTEST_A1` | 404 |

预览、列表、`access-check` 必须使用同一套判定，不能出现列表可见但内容 404，或列表不可见但知道 ID 可以下载。

### TC-04 deny 优先级（P0）

1. 赵敏在 `ACLTEST_C4`：文档内 `g-all` read + `u-zhao` deny，结果拒绝。
2. 王芳在 `ACLTEST_A3`：知识库默认 `g-all` read + `g-support` deny，结果拒绝。
3. 外包成员在 `ACLTEST_D2`：知识库 deny + 文档 read，结果拒绝。
4. 陈晨在 `ACLTEST_B3`：知识库默认 read + 用户 deny，结果拒绝。

### TC-05 角色边界（P0）

- `tenant_admin` 张明对 `ACLTEST_C1`（无任何 ACL）必须可读，`reason=role_override`。
- `knowledge_admin` 陈晨对 `ACLTEST_C1`：
  - `GET /api/knowledge-bases/:id/documents?includeLocked=true` 能看到元数据；
  - `canRead=false`；
  - `access-check` 拒绝；
  - `content` 返回 404。
- `member` 不能通过任何角色绕过 ACL。

### TC-06 ACL 缓存失效（P1）

1. 王芳读 `ACLTEST_A1` 允许。
2. 管理员给该文档加 `u-wang` deny。
3. 不重启服务，立即再次 `access-check`，必须拒绝。
4. 删除该 deny，立即恢复允许。
5. 对知识库 B 临时增加 `g-all` 默认 read，王芳从拒绝变为允许；恢复 `g-product` 后立即变回拒绝。

验证点：ACL 变更递增 `acl_version`，Runtime/API 缓存不使用旧版本。

### TC-07 跨租户隔离（P0）

1. 其他租户管理员读取 `tenant-demo` 知识库：404。
2. 其他租户管理员对 `tenant-demo` 文档 `access-check`：404。
3. 其他租户管理员读取 `tenant-demo` 文档内容：404。
4. 张明读取 `跨租户隔离测试库`：404。
5. 张明对 `doc-perm-other` 做 `access-check`：404。

即使知道对方 ID，也不能通过 `includeLocked=true`、预览或内部接口越界。

### TC-08 检索与对话范围（P1，人工）

1. 用王芳登录，在对话中只选择 `权限测试-A`，提问“`ACLTEST_A1` 是什么”。应能引用 A1。
2. 用外包成员登录，只选择 `权限测试-D`，提问“`ACLTEST_D2` 是什么”。不允许引用 D2，因为知识库 deny。
3. 用赵敏登录，只选择 `权限测试-B`。B 没有赵敏可读文档，检索结果应为空，不能因为知识库默认就把 B 扩大给赵敏。
4. 用陈晨登录，选择 `权限测试-C`，提问“`ACLTEST_C1` 是什么”。C1 不可读，不应产生引用。
5. 对话目标知识库只能收窄服务端 ACL scope，不能扩大；模型传入的 `knowledgeBaseIds` 不能绕过 ACL。

### TC-09 文档权限页与部门（P2）

1. 文档权限页的列应为：文档、知识库、状态、类型、部门、更新；不再显示可见人数和例外。
2. A/D 显示“平台部”，B 显示“产品部”，C 显示“售后部”。
3. 类型列应正确显示 TXT（测试文档均为 TXT）；切换真实演示库可看到 PDF/MD/DOCX/TXT。
4. 知识库设置中修改归属部门后，文档权限页的部门随之变化，但访问结果不变。
5. 不具备管理权限的成员看不到“设置权限”入口。

## 6. 自动化结果

2026-10-24 在本机执行 API 验证：

- 文档读取矩阵：12 篇 × 6 个账号 = 72 个断言，全部通过。
- 内容预览：10 个正反向用例，全部通过。
- 跨租户：5 个用例，全部返回 404。
- 缓存失效：文档 ACL、知识库 ACL 各 1 组，全部立即生效。
- `knowledge_admin`：元数据可见、`canRead=false`、`access-check` 拒绝、内容 404，全部通过。
- 检索索引：用唯一标记查询，A1/B2/C4/D2 的首条命中均是目标文档。
- 总体结果：`pass=true`，`failures=0`。

自动化脚本与原始结果位于本机临时目录 `C:\Users\A2736\AppData\Local\Temp\opencode\pichat-demo\`（`setup-acl-fixtures.ps1`、`verify-acl.ps1`、`acl-verify-results.json`），未提交到仓库。

## 7. 数据清理

测试数据均带明确前缀，便于清理：

- 知识库：`权限测试-A/B/C/D`，可在知识库界面软删除；软删除后名称仍占用，若需完全清理本机可硬删除对应行。
- 测试成员：`perm.outsource@example.com`、`perm.newcomer@example.com`。
- 隔离租户：`tenant-perm-other` 及其用户/知识库/文档。
- 测试文档：标题前缀 `A1/A3/B1/B2/B3/C1/C2/C3/C4/D1/D2/D3`，正文含唯一标记 `ACLTEST_*`。

清理前请确认不再需要手工验收；清理后应重新执行 `pnpm test` 与一次列表/检索冒烟，确认没有残留 ACL 缓存或悬挂引用。
