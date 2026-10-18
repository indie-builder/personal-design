# Wren ChatBI 原生技能集成方案

核验日期：**2026-10-05**。本轮核对官方文档、GitHub 源码、npm/PyPI 发布元数据、当前应用和已安装 Pi SDK；未安装依赖、运行服务、调用模型或读取业务数据，未修改应用代码。仓库基线为 `main` / `2ba8359`，开始研究时工作区干净，`git fetch origin` 后与 `origin/main` 一致。结论是选型与工作量估算，尚未实施。

> 当前实现：远端 MCP 接入已于 2026-10-05 合并 [PR #44](https://github.com/indie-builder/personal-design/pull/44)（`2eeadf2`）。现在修改智能问数时，从 [AI 问答运行链路](../design/execution/ai-chat.md#运行链路)与[配置](../design/execution/ai-chat.md#配置)进入；工具注册和桥接见 [analytics-tools.ts](../../apps/web/lib/analytics-tools.ts)、[analytics-mcp.ts](../../apps/web/lib/analytics-mcp.ts)。下文保留实施前的选型快照，SDK／WASM 建议不代表当前应用架构。

## 结论

**可以保留 Pi Harness 与 OpenUI，只使用 Wren 的语义层和执行能力；MCP 不是前提。** 当前更值得验证的是 `wrenai` Python SDK 或官方 WASM npm 包，而不是迁入旧 WrenAI 的 Docker 聊天应用。官方 MCP 的 `query_cube` 内部也只是调用公开的 `wren_core.cube_query_to_sql`，再走 engine 执行，证明这个能力没有绑定 MCP 协议。[Python engine](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/engine.py)、[MCP adapter](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/mcp_server.py)

- **需要 DuckDB、外部数据库、可检查的目标方言 SQL 或较完整的查询约束**：优先 `wrenai==0.15.0` + `wren-core-py==0.8.0`，由 Pi 原生工具调用。Python 是实际运行依赖，Node 可经受控子进程/worker 适配；本轮没有证明特定 Next.js 或 Vercel 部署可以运行。[发布包](https://pypi.org/project/wrenai/0.15.0/)、[binding](https://pypi.org/project/wren-core-py/0.8.0/)、[engine](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/engine.py)
- **接受 DataFusion 执行、文件输入和内存表生命周期，想保持 Node 运行时**：官方 `@wrenai/wren-core-wasm@0.4.1` 已发布 `cubeQuery`、`listCubes`、MDL 与 CSV/Parquet/JSON 注册。它没有公开独立 SQL 编译/`dry_plan` 方法，也没有 DuckDB 连接；发布类型尚无 `orderBy`，不能把当前 Rust/Python 的排序能力推给这个 npm 版本。[npm registry](https://registry.npmjs.org/@wrenai%2fwren-core-wasm)、[0.4.1 类型](https://unpkg.com/@wrenai/wren-core-wasm@0.4.1/dist/index.d.ts)
- **想直接复用完整 ChatBI API**：旧 OSS ChatBI REST 仍在 `legacy/v1`，但当前 README 明确说它不再获得新功能或安全修复。维护中的完整产品是商业 Cloud/Enterprise Plus，API 和授权条件另行确认。这两者与当前 main 的 OSS core 不能统称为同一套“完整 Wren”。[当前 README](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/README.md#what-happened-to-the-docker-based-wren-ai-genbi-app)、[商业边界](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/docs/core/concepts/oss_vs_commercial.md)

官方已提供 Wren skill 和 Pi 安装指引，但该指引面向 **Pi 编程 CLI 会话**。官方 skill 依赖 `wren` CLI、Python、profile 和项目文件，不会因复制到本仓库 `.claude/skills` 就自动成为 Web 应用 Pi Harness 的运行能力。技能文字应指导工具选择与业务理解，执行权限仍由应用的实际工具注册、参数校验和数据访问约束控制。[官方 skill](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/skills/wren/SKILL.md)、[Pi 指引](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/docs/core/get_started/quickstart-with-agent/pi.md)

## 版本与历史证据边界

| 来源 | 本轮核定值 | 如何使用 |
| --- | --- | --- |
| WrenAI main | `2cc843fd87d6cfe9831554721559018dda2938a0`，提交时间 `2026-10-02T02:17:30Z` | 当前架构、迁移、许可与文档快照。[commit](https://github.com/Canner/WrenAI/commit/2cc843fd87d6cfe9831554721559018dda2938a0) |
| 当前最新 GitHub release | `wren-v0.15.0`；release 正文日期 2026-09-16，实际 published_at `2026-09-21T02:43:50Z` | GitHub 发布页的两种日期不同，按实际发布时间记录。[release](https://github.com/Canner/WrenAI/releases/tag/wren-v0.15.0) |
| Python 发布包 | `wrenai 0.15.0`、`wren-core-py 0.8.0`，Python `>=3.11`，Apache-2.0 | engine 方法按 `wren-v0.15.0` 源码，Cube binding 按 `wren-core-py-v0.8.0` 源码核查。[wrenai 元数据](https://pypi.org/pypi/wrenai/json)、[binding 元数据](https://pypi.org/pypi/wren-core-py/json) |
| npm 发布包 | `@wrenai/wren-core-wasm 0.4.1`；2026-05-15 发布；Node `>=16`；gitHead `e46a5599d65dc52df9edb385b36af44f2f5bc9b1` | 以发布 `.d.ts` 为 JS 可调用合同，并核对该 gitHead 的 Rust 实现。[registry](https://registry.npmjs.org/@wrenai%2fwren-core-wasm)、[单版本元数据](https://registry.npmjs.org/@wrenai%2fwren-core-wasm/0.4.1) |
| 旧 ChatBI 分支 | `legacy/v1` HEAD `ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc`，2026-08-18 | 本文旧 REST/Docker/配置均锁到这个提交。[commit](https://github.com/Canner/WrenAI/commit/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc) |
| 旧产品保存 tag | `v1-final` → `e42b8d057c611016d781c7bbe74ba4e5aeb9712d` | 与上述分支 HEAD 不同，不把本文的分支接口形状冒称为 tag 的逐项合同。[tag](https://github.com/Canner/WrenAI/tree/v1-final)、[ref API](https://api.github.com/repos/Canner/WrenAI/git/ref/tags/v1-final) |
| Cloud API 文档 | ReadMe 当前 Getting Started 指向 `/api/v2`；Wren quick start 仍举 `/api/v1` | 动态页面没有本轮可锁定的源码版本。接入前必须重新核 schema，不能混用 v1/v2 示例。[当前 reference](https://wrenai.readme.io/reference/cloud-getting-started)、[较旧 quick start](https://docs.getwren.ai/cp/guide/api-access/quick-start) |

先读了 [Node 嵌入研究](wren-node-embedding-notes.md)、[WASM 存储研究](wren-wasm-storage-notes.md)、[DuckDB/Ontology/Pi 方案](ai-analytics-duckdb-ontology-pi.md)。这些是 **2026-09-26 的历史研究和 PoC**。本轮继承其中“直接 SDK 路径曾做探针、WASM 曾做合成数据性能探针”的记录，但没有复跑；本轮重新核验了发布版本、方法形状、执行器、技能、许可和旧产品迁移状态。

历史记录里的“几十万行以内、定期文件导入”是旧场景假设，本轮用户尚未重申，不据此确定当前规模。旧方案引用的 Pi `0.87.1` 也不能作为当前应用接口依据。历史本机 PoC 不等于当前 Web 应用已集成，不等于 Next.js 生产打包、宿主平台、真实多表数据或多用户并发已通过验收。

## 当前模块边界

官方 README 记载，2026-05-07 Wren Engine 合并进 `Canner/WrenAI/core/`，原 [Canner/wren-engine](https://github.com/Canner/wren-engine) 已归档。当前实际目录为 `core/wren-core/`，不能把旧 Java/HTTP engine、Rust crate、Python distribution 和 WASM SDK 当作同一种可替换运行组件。[README](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/README.md)、[归档仓库 API](https://api.github.com/repos/Canner/wren-engine)

| 模块 | 职责 | 是否包含完整聊天 Agent/UI |
| --- | --- | --- |
| `core/wren-core`、`wren-core-base`、`wren-mdl` | Rust/DataFusion 语义分析、MDL、Cube SQL 编译及模型类型 | 不是完整聊天产品。[架构](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/docs/core/reference/architecture.md) |
| `core/wren-core-py` | PyO3 binding；发布 distribution `wren-core-py`，Python import 为 `wren_core` | 编译与模型 API。[binding exports](https://github.com/Canner/WrenAI/blob/wren-core-py-v0.8.0/core/wren-core-py/src/lib.rs) |
| `core/wren` / `wrenai` | Python SDK、数据库 connectors、CLI、可选 memory/MCP/配置 UI | 可供已有 Agent 使用；`wren ask` 只生成提示词。[manifest](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/pyproject.toml)、[ask 源码](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/ask.py) |
| `core/wren-core-wasm` | TS wrapper + DataFusion WASM 本地执行 | 没有自然语言聊天循环；Node/浏览器宿主可调用。[SDK](https://unpkg.com/@wrenai/wren-core-wasm@0.4.1/dist/index.d.ts) |
| `sdk/wren-langchain`、`sdk/wren-pydantic` | 特定 Python Agent 框架适配 | 可选；Pi 使用底层 SDK 无需迁入这些框架。[SDK overview](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/docs/core/sdk/overview.md) |
| `skills/wren` + Python 包内 workflow guides | Coding Agent 的发现入口、建模/查询/接源/GenBI 工作流说明 | 指南；Agent 和 CLI 分别负责推理与执行。[skill reference](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/docs/core/reference/skills.md) |
| `legacy/v1` | 旧 Wren GenBI Classic：UI、AI service、engine/Ibis、Qdrant、Docker | 完整旧 ChatBI 栈；当前官方声明不再维护。[README](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/README.md#what-happened-to-the-docker-based-wren-ai-genbi-app) |
| Wren AI Cloud / Enterprise Plus | 维护中的业务用户界面、商业 Agentic/Interactive Mode、API、团队与企业治理 | 商业产品，不是当前 OSS core 的现成 REST 聊天服务。[产品边界](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/docs/core/concepts/oss_vs_commercial.md) |

README 目录说明把 Python/npm 名称简写为 `wren-core` / `wren-core-wasm`，实施应使用 registry 核定的完整 distribution 名 `wren-core-py` / `@wrenai/wren-core-wasm`。README 宣传“22+”数据源；本文不据此承诺 22 个独立驱动都已验收，具体 connector 以目标发布包源码和安装 extra 为准。[README](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/README.md)、[npm](https://registry.npmjs.org/@wrenai%2fwren-core-wasm)、[PyPI](https://pypi.org/project/wren-core-py/0.8.0/)

## 直接 SDK：保留语义层和 SQL 执行，替换聊天循环

见 [直接 SDK：保留语义层和 SQL 执行，替换聊天循环](wren-core-sdk-and-skills.md#直接-sdk保留语义层和-sql-执行替换聊天循环)。

### Python/native：精确公共接口

见 [Python/native：精确公共接口](wren-core-sdk-and-skills.md#pythonnative精确公共接口)。

### Node/WASM：已发布能力与缺口

见 [Node/WASM：已发布能力与缺口](wren-core-sdk-and-skills.md#nodewasm已发布能力与缺口)。

## 官方 skills：可以复用，但应按宿主适配

见 [官方 skills：可以复用，但应按宿主适配](wren-core-sdk-and-skills.md#官方-skills可以复用但应按宿主适配)。

## REST/HTTP：旧 OSS 与当前 Cloud 要分开

见 [REST/HTTP：旧 OSS 与当前 Cloud 要分开](wren-deployment-and-api-evidence.md#resthttp旧-oss-与当前-cloud-要分开)。

### 旧 ChatBI 的源码可调用合同

见 [旧 ChatBI 的源码可调用合同](wren-deployment-and-api-evidence.md#旧-chatbi-的源码可调用合同)。

### 当前 Cloud API

见 [当前 Cloud API](wren-deployment-and-api-evidence.md#当前-cloud-api)。

## 部署、数据源与模型依赖

见 [部署、数据源与模型依赖](wren-deployment-and-api-evidence.md#部署数据源与模型依赖)。

### 完整旧 Docker 栈

见 [完整旧 Docker 栈](wren-deployment-and-api-evidence.md#完整旧-docker-栈)。

### 当前 core 与文件路径

见 [当前 core 与文件路径](wren-deployment-and-api-evidence.md#当前-core-与文件路径)。

### LLM、embedding 与智谱条件

见 [LLM、embedding 与智谱条件](wren-deployment-and-api-evidence.md#llmembedding-与智谱条件)。

## 许可证：按实际来源路径和版本判断

见 [许可证：按实际来源路径和版本判断](wren-deployment-and-api-evidence.md#许可证按实际来源路径和版本判断)。

## 三条路线与成本假设

见 [三条路线与成本假设](wren-project-integration-plan.md#三条路线与成本假设)。

## 当前项目如何落地

见 [当前项目如何落地](wren-project-integration-plan.md#当前项目如何落地)。

### 可以复用和必须补齐的部分

见 [可以复用和必须补齐的部分](wren-project-integration-plan.md#可以复用和必须补齐的部分)。

### 技能、工具、引擎的分工

见 [技能、工具、引擎的分工](wren-project-integration-plan.md#技能工具引擎的分工)。

### 部署与现有证据

见 [部署与现有证据](wren-project-integration-plan.md#部署与现有证据)。

### 推荐验证顺序

见 [推荐验证顺序](wren-project-integration-plan.md#推荐验证顺序)。

## 尚未验证与下一步的决策门槛

见 [尚未验证与下一步的决策门槛](wren-project-integration-plan.md#尚未验证与下一步的决策门槛)。
