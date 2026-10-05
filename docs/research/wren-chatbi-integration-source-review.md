# Wren ChatBI 原生技能集成方案

核验日期：**2026-10-05**。本轮核对官方文档、GitHub 源码、npm/PyPI 发布元数据、当前应用和已安装 Pi SDK；未安装依赖、运行服务、调用模型或读取业务数据，未修改应用代码。仓库基线为 `main` / `2ba8359`，开始研究时工作区干净，`git fetch origin` 后与 `origin/main` 一致。结论是选型与工作量估算，尚未实施。

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

### Python/native：精确公共接口

`wrenai 0.15.0` 的 `WrenEngine` 是 MDL 规划和 connector 执行的 facade，不要求经过 CLI 初始化、MCP server、HTTP API 或 Wren 聊天 Agent。连接参数可以直接传入 dict；初始化的 `manifest_str` 是 **base64 编码的 MDL JSON 字符串**。[engine 源码](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/engine.py)

| API | 实际形状 | 含义 |
| --- | --- | --- |
| 初始化 | `WrenEngine(manifest_str: str, data_source: DataSource \| str, connection_info: dict \| object, function_path: str \| None = None, *, fallback: bool = True, config: WrenConfig \| None = None)` | MDL + 目标数据源与连接，connector 延迟构造。 |
| 规划 | `dry_plan(sql: str, properties: dict \| None = None) -> str` | 展开模型/视图、改写并生成目标数据库方言 SQL，不查询 DB。 |
| 执行 | `query(sql: str, limit: int \| None = None, properties: dict \| None = None) -> pyarrow.Table` | 先 `dry_plan`，再 connector query；Arrow → JSON 的转换需宿主处理。 |
| 数据库验证 | `dry_run(sql: str, properties: dict \| None = None) -> None` | 经过规划后用 connector 验证，失败抛异常。 |
| 生命周期 | `close()` 与 context manager | 释放 connector。 |
| Cube 编译 | `wren_core.cube_query_to_sql(cube_query_json: str, manifest_json: str) -> str` | 两个参数都是普通 JSON 字符串；返回 Cube SQL，随后仍需 `engine.dry_plan/query`。 |

来源：[engine](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/engine.py)、[Cube binding](https://github.com/Canner/WrenAI/blob/wren-core-py-v0.8.0/core/wren-core-py/src/cube.rs)、[exports](https://github.com/Canner/WrenAI/blob/wren-core-py-v0.8.0/core/wren-core-py/src/lib.rs)。不要把 `manifest_str` 的 base64 规则误用到 Cube binding 的 `manifest_json`。

Cube JSON 可表达 `cube`、`measures`、`dimensions`、`timeDimensions`（`dimension/granularity/dateRange`）、`filters`（`dimension/operator/value`）、`orderBy`（`member/direction`）、`limit/offset`。Python binding 0.8.0 的 tests 已覆盖未知 Cube/指标、日期范围、过滤、排序成员和排序方向错误；这是上游测试证据，本轮没有执行这些测试。[已发布版本对应测试](https://github.com/Canner/WrenAI/blob/wren-core-py-v0.8.0/core/wren-core-py/tests/test_cube.py)

据此，建议的数据路径是：Pi 选择已审核指标和过滤 → 应用原生工具验证 Cube 参数 → `cube_query_to_sql` → `WrenEngine.query` → 结构化结果 → OpenUI。追问上下文与最终图表/表格由现有 Pi/OpenUI 负责，Wren 保留模型、指标公式、关系与 SQL 执行。自然语言解析、歧义澄清和多轮可靠性并不会因接入 engine 自动获得。这是接口基础上的工程判断。[MCP 内部同路径](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/mcp_server.py)

`WrenConfig.strict_mode` 默认是 **false**；`denied_functions` 默认空集合。若应用要求只能访问 MDL 定义对象，应显式启用 strict mode 并设置函数/数据访问策略。上游严格模式能拒绝未声明表及文件/外部读取 source functions，但不能把它或提示词当作完整用户权限、资源预算与取消机制。[config](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/config.py)、[policy](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/policy.py)

### Node/WASM：已发布能力与缺口

0.4.1 的真实发布类型包含 `WrenEngine.init({wasmUrl})`、`registerCsv/registerJson/registerParquet`、`loadMDL`、`query`、`cubeQuery`、`listCubes`、`free`。Node 初始化应由宿主读取 WASM 文件并传 bytes，默认 `file://` fetch 路径会失败；不能只凭 npm 安装成功判断 Next.js 打包成功。[发布类型](https://unpkg.com/@wrenai/wren-core-wasm@0.4.1/dist/index.d.ts)、[官方 Node usage](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/core/wren-core-wasm/README.md#nodejs-usage)

发布 gitHead 的 Rust 源码确认执行器是 DataFusion，MDL 使用 `Mode::LocalRuntime`；`cubeQuery` 内部编译后直接执行 `query`。构造器是单线程 Tokio 与 `target_partitions(1)`；inline CSV/JSON/Parquet 导入 Arrow batches 并注册为 `MemTable`，查询结果 `collect()` 后再 JSON 序列化。[0.4.1 对应源码](https://github.com/Canner/WrenAI/blob/e46a5599d65dc52df9edb385b36af44f2f5bc9b1/core/wren-core-wasm/src/lib.rs)

| 需求 | 0.4.1 的限制 | 实施判断 |
| --- | --- | --- |
| DuckDB 持久数据库与外部 DB 执行 | 无 DuckDB 文件/连接或 connector 注册 API | 需要 Python/native 或不同桥接；WASM 数据复制不等于直连 DuckDB。 |
| 查询前检查目标方言 SQL | 没有公开 `dry_plan` / 独立 `cube_query_to_sql` JS 导出 | 不能照搬 Python 的编译 → 审核 → DB 执行链路。 |
| 指标 Top N / 排序 | 发布 `CubeQueryInput` 无 `orderBy` | 可以对**完整、有界聚合结果**受控排序再取 N；先 Cube `limit=N` 再排序会丢真实 Top N。也可以考虑经过受控校验的 `query(sql)`，但这增加 SQL 校验工作，不能声称结构化 Cube 已具排序。 |
| 持久化 | 发布 API 没有创建/打开持久 DB、保存注册表入口 | 应用保存源文件；重启重新注册，按版本复用 engine。 |
| URL Parquet | 通过 HTTP(S) 源读取，需 Range；浏览器还需 CORS | 不是普通“任意 URL 文件连接器”；发布类型另警告不同 schema 同 bare table name 会碰撞。 |
| 大结果或并发 | 结果全量 JSON，当前 WASM 执行单线程 | 需业务行数上限、内存预算和宿主生命周期验收；不能用行数单独承诺容量。 |

上述 API 边界来自 [发布类型](https://unpkg.com/@wrenai/wren-core-wasm@0.4.1/dist/index.d.ts) 和 [发布对应源码](https://github.com/Canner/WrenAI/blob/e46a5599d65dc52df9edb385b36af44f2f5bc9b1/core/wren-core-wasm/src/lib.rs)；受控排序等是工程建议，不是已完成实现。当前 main SDK 出现的新增字段不能替代 npm 0.4.1 的合同。

本轮核查的官方仓库/发布接口没有找到可直接用于 Node 的原生 DuckDB 语义规划 binding；确认有的是 Python native binding 与 Node WASM。这个结论限于本轮已查公开来源，不推断所有未来 SDK。

## 官方 skills：可以复用，但应按宿主适配

官方 discovery stub 的元数据为 `name: wren`、Apache-2.0、`allowed-tools: Bash(wren:*)`。工作流正文自 0.8 起随 Python `wrenai` 包分发，通过 `wren skills get <name>`、`--full` 或 `--script <name>` 获取。调用 `get` 输出指南/脚本源码，并非自动执行整个工作流。[stub](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/skills/wren/SKILL.md)、[分发说明](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/docs/core/reference/skills.md)、[打包配置](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/pyproject.toml)

官方 Pi 指引是 `npx skills add Canner/WrenAI --agent pi`，然后启动交互式 `pi` 并要求 `/wren` 安装设置。这证明官方支持 Pi 编程客户端的技能安装，不能证明任意嵌入式 Pi Harness 会自动发现该目录或附带 Bash/profile/filesystem 权限。[Pi quickstart](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/docs/core/get_started/quickstart-with-agent/pi.md)

`usage` workflow 依赖：Python/venv 与 CLI、`~/.wren/profiles.yml`、项目 `wren_project.yml`/`target/mdl.json`、`wren context`、`wren cube query` 或 `wren --sql`，可选 memory。它还建议 successful query 默认写 memory，并提供安装、连接设置及错误修复指令。这套适合有文件/终端工具的开发助手，Web 访客的日常问数不宜直接获得其完整安装、修改模型、接源和部署工作流。[usage skill](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/skills_content/usage/SKILL.md)

应用可以复用该指南中“先查模型/指标、复杂查询先验证、聚合优先 Cube、Top N 必须排序”的规则，并将可用 context/skill 内容由服务端显式交给 Pi，执行工具仍注册成受控的业务 API。`allowed-tools` 是供理解该字段的客户端使用的元数据，不会替代本应用的实际工具注册或授权。无需为了技能接入而开放通用 shell。以上是宿主适配建议；本地 Pi 的具体加载行为由应用代码另行核验。

MCP 也属于可选适配：`query_cube` 在 `@mcp.tool` 外壳里组合公共 Cube compiler 和 engine；同样的编译/执行逻辑可以注册成 Pi 原生工具。这里的“无需 MCP”不表示无需工具执行层或无需宿主管理进程。[adapter 源码](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/mcp_server.py)

## REST/HTTP：旧 OSS 与当前 Cloud 要分开

### 旧 ChatBI 的源码可调用合同

下列接口来自 `legacy/v1` 的 `ce9ed54…`，不是当前 main core 的服务接口。AI service FastAPI router 的实际前缀是 `/v1`。[入口](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ai-service/src/__main__.py)

| 操作 | 方法/路径 | 关键输入/输出 |
| --- | --- | --- |
| Ask | `POST /v1/asks`（AI service） | 输入 `query`、`mdl_hash`（兼容 `id`）、可选 `histories:[{question,sql}]`、configuration 等；返回 `{query_id}`，后台生成。 |
| Poll | `GET /v1/asks/{query_id}/result` | `status` 包括 understanding/searching/planning/generating/correcting/finished/failed/stopped；完成 `response:[{sql,type,viewId?}]`，失败有 error。它首先返回 SQL 候选，不是结果行。 |
| Follow-up | 同 Ask，传 `histories` | 服务根据非空 histories 选择 followup SQL/reasoning pipeline；不是另一个必需 endpoint。 |
| Stream/stop | `GET /v1/asks/{query_id}/streaming-result`；`PATCH /v1/asks/{query_id}` | SSE；停止请求 `{status:"stopped"}`。 |
| MDL indexing | `POST /v1/semantics-preparations` | `mdl` 为 JSON **字符串**，`mdl_hash` 兼容 `id`；response serialize 为 `{id}`。 |
| MDL indexing poll | `GET /v1/semantics-preparations/{mdl_hash}/status` | indexing/finished/failed。 |
| UI SQL generation | `POST /api/v1/generate_sql`（wren-ui） | `{question,threadId?,language?,returnSqlDialect?}` → `{sql,threadId}`；取当前 project 的已保存 deployment，并内部 poll AI service。 |
| UI SQL execution | `POST /api/v1/run_sql`（wren-ui） | `{sql,threadId?,limit?}`，默认 limit 1000 → `{records,columns,threadId,totalRows}`；`totalRows` 是本次返回行数，不能当全数据总量。 |

来源：[ask router](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ai-service/src/web/v1/routers/ask.py)、[request/results/followup service](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ai-service/src/web/v1/services/ask.py)、[BaseRequest](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ai-service/src/web/v1/services/__init__.py)、[MDL router](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ai-service/src/web/v1/routers/semantics_preparation.py)、[MDL schemas](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ai-service/src/web/v1/services/semantics_preparation.py)、[generate_sql](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ui/src/pages/api/v1/generate_sql.ts)、[run_sql](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ui/src/pages/api/v1/run_sql.ts)。

**语义 indexing 不等于完整部署。** UI deploy service 会保存 project 的 manifest/hash/deployment 记录，再调用 AI service indexing。单独向 `/semantics-preparations` 上传 MDL，不会自动建立 UI 项目、数据库连接和供 `/api/v1/run_sql` 查询的 deployment。[deploy service](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ui/src/apollo/server/services/deployService.ts)、[AI adaptor](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ui/src/apollo/server/adaptors/wrenAIAdaptor.ts)

底层旧 engine adaptor 的 DuckDB preview 为 `GET /v1/mdl/preview`，body `{sql,limit,manifest}`；dry-plan 是 `GET /v1/mdl/dry-plan`。外部数据库经 Ibis `POST /{version}/connector/{data_source}/query`，body 含 `sql,connectionInfo,manifestStr`（base64 MDL）。GET body 的调用方式需要支持它的 HTTP 客户端/网关，不能直接按浏览器 fetch 的常规写法照抄。这些是旧服务接口，不是 Python `WrenEngine.query` 的 HTTP 版合同。[engine adaptor](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ui/src/apollo/server/adaptors/wrenEngineAdaptor.ts)、[Ibis adaptor](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ui/src/apollo/server/adaptors/ibisAdaptor.ts)

稳定性限制很具体：Ask result 和 MDL indexing status 使用进程内 `TTLCache`，构造默认 ttl 120 秒；重启和结果过期不能按耐久任务库理解。源码还有 `mdl_hash/id` 兼容别名以及准备移除旧字段的注释。再结合官方 retirement 声明，适合解释旧能力，不宜选为无需维护的生产基础。[ask service](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ai-service/src/web/v1/services/ask.py)、[semantics service](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ai-service/src/web/v1/services/semantics_preparation.py)、[retirement](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/README.md#what-happened-to-the-docker-based-wren-ai-genbi-app)

### 当前 Cloud API

当前 ReadMe Getting Started 给出 base `https://cloud.getwren.ai/api/v2`、`Authorization: Bearer YOUR_API_KEY`，并明确 v1 deprecated。SQL generation reference 列 `POST /v2/generate_sql`、`POST /v2/run_sql`、stream generate/ask/interactive_ask 与对应 respond；这些页面的 `/v2/...` 路径应与 getting-started base 规范核对，不能重复拼 `/api/v2/v2`。[getting started](https://wrenai.readme.io/reference/cloud-getting-started)、[SQL API overview](https://wrenai.readme.io/reference/cloud_sql_generation)

Wren 另一个 quick start 仍显示 `/api/v1/generate_sql`：输入 `projectId,question,threadId?`，返回 `id,sql,threadId`。这里的 `projectId` 和 bearer auth 与 OSS UI“取当前 project”的 handler 不同。**Cloud 和旧 OSS API 不是仅换 host 即可互通。**[quick start](https://docs.getwren.ai/cp/guide/api-access/quick-start)、[OSS handler](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ui/src/pages/api/v1/generate_sql.ts)

Cloud overview 区分 classic/Interactive SQL/chart API 和 Agentic Mode（SSE、执行、澄清、取消、文件等），API access 至少需要 Essential Cloud。官方说明现有 MDL/context 可以迁移；这不保证旧 OSS deployment、线程历史、连接凭据和 API client 无改动迁移。[API overview](https://docs.getwren.ai/cp/guide/api-access/overview)、[OSS/commercial boundary](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/docs/core/concepts/oss_vs_commercial.md)

本轮未核到当前 Cloud 每个 endpoint 的完整 request/response schema 或其兼容承诺；部分猜测的单接口 URL 返回 404，未做认证调用。没有把 v1 quick start 字段冒称为当前 v2 合同。

## 部署、数据源与模型依赖

### 完整旧 Docker 栈

旧 compose 有六个 services：一次性 `bootstrap`、`wren-engine`、`ibis-server`、`wren-ai-service`、`qdrant`、`wren-ui`；运行主体五个。UI 使用 SQLite 保存应用状态，Qdrant 保存向量；bootstrap/engine/Qdrant/UI 共享命名 volume 中的各自目录，AI service 挂 config 与数据。[compose](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/docker/docker-compose.yaml)

该分支 `.env.example` 是一组独立 image 版本：product `0.29.2`、engine/Ibis `0.22.0`、AI service `0.29.3`、UI `0.32.3`、bootstrap `0.1.5`。不能以 Python `wrenai 0.15.0` 替换其中某个镜像而假设旧 UI/API 兼容。[env](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/docker/.env.example)

本轮在官方 Docker README、旧 README、当前 operational 文档及官方文档定向检索中没有核到明确 CPU/RAM 最低或推荐数值，因此不写“至少 8/16 GB”等配置。compose 也没有提供可据以承诺容量的 CPU/memory sizing。资源预算应按选定数据、查询和并发实测。[Docker README](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/docker/README.md)、[operational](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/docs/core/reference/operational.md)

### 当前 core 与文件路径

Python `wrenai` 基础依赖含 `wren-core-py>=0.8.0`、DuckDB、sqlglot、PyArrow 等；memory、MCP、UI 和其他 DB drivers 是 extras。**基本 engine 查询不需要 Qdrant、Wren AI service 或 LLM/embedding。** 这是依赖声明与 engine 执行流程可核实的结论。[pyproject](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/pyproject.toml)、[engine](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/engine.py)

当前官方 connect 文档列 DuckDB、Postgres、MySQL、BigQuery、Snowflake、ClickHouse、Trino、SQL Server、Databricks、Redshift、Oracle、Athena、Spark。源码另外定义 `local_file/s3_file/minio_file/gcs_file` 等类型；特定驱动、系统库和认证方式仍须按目标源安装/验收，不能因 enum 存在承诺云环境即插即用。[connect](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/docs/core/guides/connect.md)、[data source](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/model/data_source.py)、[factory](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/connector/factory.py)

文件输入有三个不同层次：

1. Python `LocalFileConnectionInfo` 提供 `url` 与 `format`（示例 csv/parquet/json/duckdb）；DuckDB connector 对 format=duckdb 扫指定目录，按文件名别名只读 ATTACH `.duckdb`。profile 传的是目录，并非任意数据库 connection string。[model](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/model/__init__.py)、[connector](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/connector/duckdb.py)
2. WASM 由应用先读取 CSV/JSON/Parquet bytes/object，再注册表、加载 MDL。它不是完整上传/类型审核/增量更新产品；上传 UI、文件持久保存、类型校验、数据版本发布和重载由应用另做。[发布类型](https://unpkg.com/@wrenai/wren-core-wasm@0.4.1/dist/index.d.ts)
3. 官方 dlt skill 描述 SaaS API → dlt → 本地 DuckDB → introspection script → MDL 编译。它需要 Python/dlt 和源服务凭据，是 ingestion workflow，不是对 Web 访客开放一个 skill 即获得托管 CSV 管理。[dlt skill](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/core/wren/src/wren/skills_content/dlt-connector/SKILL.md)

本文未核定当前 Cloud CSV upload API 的认证、大小上限、格式、价格与生命周期，也未将旧 Docker 数据目录挂载解释成现成上传 API。

### LLM、embedding 与智谱条件

- 旧 ChatBI 有独立 LLM、embedder、document store、pipeline 配置。官方 `config.zhipu.yaml` 举 LiteLLM + `openai/glm-4.5`、普通 base `https://open.bigmodel.cn/api/paas/v4/`，涉及 `extra_body`、thinking、JSON 输出参数；embedding 示例仍单独使用 OpenAI `text-embedding-3-large` 和 Qdrant dimension=3072。这个例子证明有智谱配置路径，不是当前 Coding Plan 或任何新 GLM 版本兼容保证。[Zhipu config](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/wren-ai-service/docs/config_examples/config.zhipu.yaml)
- 该旧例子注释称 GLM 没有 embedding，不能把这个旧注释当作 2026 年智谱产品目录结论。能核定的是 ChatBI 的 LLM 和 embedding 分别配置、dimension 要匹配，未核定 Coding Plan 包含 embedding。
- 当前 core 的 semantic memory 是可选 extras；main embedding 源码使用本地 Sentence Transformers 或 ONNX，默认 multilingual MiniLM，可配置环境变量及本地/Hugging Face cache。memory 可能引入模型下载、索引和机器资源，但直接 `WrenEngine.query` 不经该路径。[extras](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/pyproject.toml)、[main embedding implementation](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/core/wren/src/wren/memory/embeddings.py)
- Pi 驱动 core 时，LLM 由 Pi/provider 提供，Wren core 不强制选某厂商。需要验收模型是否正确生成受控工具参数、保持追问筛选、澄清指标歧义、遵循结果呈现协议；OpenAI-compatible transport 和工具语义正确性是不同的验收项。

智谱官方 FAQ 的问题标题 **“Q：套餐额度有应用场景限制吗？”** 明确写：

> “在除规定工具外调用 API，不可享用 Coding 套餐的额度。”
>
> “如需在自建应用、网站、机器人、SaaS 产品等场景中通过 API 集成模型能力，请使用智谱提供的标准 API 服务，并根据对应协议计费。”

来源：[智谱 Coding Plan FAQ](https://docs.bigmodel.cn/cn/coding-plan/faq)。本轮未找到针对 Pi 工具或 Web 嵌入 Harness 的例外说明。因此本项目网站功能的成本预算应以**标准 API 单独计费或得到明确适用确认**为条件，不能因为使用 Pi 编程 Harness 就默认把网站问数计入已有 Coding Plan。这里不评价现有配置，结论限于新功能选型与成本假设。

## 许可证：按实际来源路径和版本判断

| 对象 | 已核定许可 | 影响 |
| --- | --- | --- |
| 当前 main `core/**`、`sdk/**`、`skills/**`、`examples/**` | Apache-2.0 | 可评估作为独立 core/SDK/skill 依赖，保留许可/通知。 |
| 当前 `docs/**` | CC BY 4.0 | 复用/改编官方指南正文需要对应署名与许可处理。 |
| 当前 root overview | 说明 package manifest 对发布 artifact 优先；虽携带 AGPL 文本，表中尚无已列 AGPL 组件 | 不能看到 `LICENSE-AGPL-3.0` 就推断当前 core 是 AGPL；也不能仅看 README Apache badge 判断所有文档。 |
| npm WASM 0.4.1 | registry Apache-2.0；目录 LICENSE 也为 Apache-2.0 | 发布包与源码目录一致。 |
| `wrenai 0.15.0`、`wren-core-py 0.8.0` | package manifests/PyPI 为 Apache-2.0 | Python distribution 名称与 import 名称不同，许可仍按所选包。 |
| 旧 `legacy/v1` ChatBI | 分支根 LICENSE 是 AGPL-3.0 正文 | 不能套用当前 main core 的 Apache 许可；选用/修改旧产品需按该版本实际许可处理。 |
| Cloud / Enterprise Plus | 商业条款 | OSS source license 不代表托管 API 或 Enterprise 部署免费、可无限使用。 |

来源：[main LICENSE 路径映射](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/LICENSE)、[WASM 目录 LICENSE](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/core/wren-core-wasm/LICENSE)、[npm](https://registry.npmjs.org/@wrenai%2fwren-core-wasm/0.4.1)、[wrenai manifest](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/pyproject.toml)、[binding PyPI](https://pypi.org/project/wren-core-py/0.8.0/)、[旧 LICENSE](https://github.com/Canner/WrenAI/blob/ce9ed54c86acb8a0b6ff5d5fea23ed60f057acfc/LICENSE)、[商业边界](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/docs/core/concepts/oss_vs_commercial.md)。

官方当前 README 与商业边界文档对“OSS RLAC/CLAC primitive”和“商业用户/组权限”等措辞粒度不同；本文只确认来源确实分别列出这些功能，不承诺 OSS 已具有商业版完整身份与租户治理。首版无需引入尚未请求的企业权限范围。

## 三条路线与成本假设

| 路线 | 保留/引入内容 | 适用判断 | 主要成本 |
| --- | --- | --- | --- |
| 完整自托管 API | 旧 Classic 的 Docker/UI/AI service/Qdrant/engine/Ibis；或另购商业 Enterprise Plus | 旧 REST 能用源码验证，但 retirement 是实际维护负担；商业自托管需报价、接口与部署资料 | 多服务运维、LLM+embedding、旧版本修补或商业授权；接入还要处理模型 deployment、thread/result 及 UI 数据转换。 |
| core + Pi 原生 tool/skill | 官方 Python compiler/engine 或受条件限制的 WASM；Pi 负责自然语言和多轮，OpenUI 显示真实结果 | 当前最符合复用已有 Harness 的方向。业务 skill 显式供应用加载；查询由受控工具执行 | 模型数据建设、Python/native 宿主或 WASM 生命周期适配、工具参数/执行约束、真实问题验收。 |
| 纯 JS 轻量接入 | Node HTTP 调 Cloud，或 Node 调 WASM 0.4.1 | HTTP 接入运行时简单但业务处理在外部；WASM 内嵌语义+执行可行但改变为 DataFusion | Cloud 订阅/API额度与传输；WASM 文件导入内存、排序缺口、打包/冷启动/并发限制。它不是原生 DuckDB 编译器的 JS 替身。 |

本轮不是实施排期。成本估算的共同前提仅为**一个数据主题、已有清洗表或固定文件、3–5 张表、5–10 个已定义指标、20–30 个标准问题**；这些是估算假设，不是用户新确认的需求。不含上传管理 UI、账号/租户、企业权限和任意数据接源产品。

在上述前提下，主会话提出的 core + Pi 原生工具范围可先按 **2–4 人日验证、7–12 人日首版**评估，首版包含建模和真实验收。这里是工程估算，不是 Wren 官方报价，不能由历史合成单表 benchmark 保证。首次模型数据建设至少要做字段类型/键/关系粒度确认、指标单位和过滤/时间口径确认、MDL/Cube 编写、标准 SQL 和预期结果对照；现成 schema introspection 可以减少机械工作，不能替业务人确认指标定义。[官方 model guide](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/docs/core/guides/model.md)、[enrich workflow](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/src/wren/skills_content/enrich-context/SKILL.md)

首版 **7–12 人日是包含验证的总量**，不是在 2–4 人日验证之后再叠加。按一位熟悉本仓库的开发者估算：业务指标/MDL/标准结果 2–3 人日；Wren 运行与原生工具适配 2–3 人日；查询状态、多轮参数和 OpenUI 结果呈现 2–3 人日；真实模型、异常路径、部署和回归 1–3 人日。工作可交叉推进，实际日历时间受数据和口径确认影响。Cloud 已有项目及语义模型时，HTTP 接口验证可暂按 1–2 人日、接入现有聊天首版 4–7 人日评估；若尚无数据模型，另需建模时间。这些均为工程估算，Cloud v2 合同尚未完整核定，因此置信度较低。旧 Classic 的维护负担无法以一次接入工期覆盖，不建议作为新功能的默认基础。

## 当前项目如何落地

### 可以复用和必须补齐的部分

当前应用使用 `@earendil-works/pi-coding-agent` / `pi-ai` **1.0.2**，OpenUI **0.16.3**；旧研究的 Pi 0.87.1 已过时。默认助手的轻舟协作数据是明确标注的虚构案例，当前图表体现生成式 UI 能力，尚未查询真实业务数据。[依赖](../../apps/web/package.json)、[默认案例与类型](../../packages/ai-chat/src/index.ts)、[现行运行契约](../design/execution/ai-chat.md)

| 层 | 当前实现 | 首版扩展 |
| --- | --- | --- |
| 聊天和展示 | 已有单列聊天、智能体选择、多轮、表单回传、图表表格、停止和一次 UI 修复 | 继续复用；建议新增「智能问数」内置智能体，原默认助手保留。这是建议，尚非本轮用户确认。 |
| Pi 工具 | `pi-chat.ts` 为 `noTools:'all', tools:[]`，未注册业务工具 | 由服务端固定能力配置传 `customTools` 及名称白名单；不能只更改 `noTools` 而保留空白名单。 |
| 运行时技能 | `noSkills/noExtensions/noContextFiles` 均关闭 | 应用显式注入分析指南，或提供只返回打包指南的 `load_skill(name)`；不自动发现开发目录的所有技能。 |
| 流式协议 | `route.ts` 拼接所有 assistant `text_delta` 到同一个 OpenUI 输出 | 查询阶段发送独立状态；结果确定后由最终展示阶段生成 OpenUI，避免工具前文字污染 parser。 |
| 多轮数据 | 保存 user/assistant 文本、表单状态、最多1500字符摘要；每请求重建内存 session | 增加结构化查询上下文和结果引用；精确数字、查询参数及版本不依赖摘要。 |
| 数据执行 | 应用尚无 Wren 依赖、数据连接或导入管理 | 新增 `packages/ai-analytics` 之类的包 API，统一暴露模型和查询；App 不直接读取 DB 或拼路径。 |

实现依据：[pi-chat.ts](../../apps/web/lib/pi-chat.ts)、[route.ts](../../apps/web/app/api/ai-chat/route.ts)、[前端流](../../apps/web/lib/use-pi-chat.ts)、[存储](../../apps/web/components/ai-chat/use-saved-chat.ts)、[生成协议源](../../apps/web/scripts/generate-openui-prompt.mjs)。相关源码已只读核验；没有实际调用新工具。

### 技能、工具、引擎的分工

```text
用户自然语言 / 表单追问
          ↓
现有 Pi：结合分析技能理解指标、日期和筛选，必要时追问
          ↓
项目原生工具：读取模型定义、校验结构化查询、执行查询
          ↓
Wren MDL / Cube：业务模型、指标公式、连接关系和查询执行
          ↓
真实结果 + 查询参数 + 数据/模型版本
          ↓
现有 OpenUI：表格、图表、口径解释与后续分析入口
```

**skill 负责“如何分析”，tool 负责“执行什么”，Wren 负责“按何种模型计算”。** MCP 是可选通信适配，这条路径没有必须使用它的地方。官方 Wren skill 面向终端助手，其安装、接源、修改模型等工作流更适合开发/维护阶段；网站运行时只需要领域分析规则和已登记的数据查询能力。

建议首版三个业务工具，以下是拟定的本项目接口，不是声称 Wren 已按这些名字发布：`list_analytics_models`、`describe_analytics_model`、`query_metrics`。当分析指南足够长时再增加 `load_skill`；短指南直接注入即可，不必先建设通用技能平台。指标公式、维度与关系从同一份 MDL/Cube 派生，skill 不再另写一套重复公式。

安装的 Pi 1.0.2 中，`tools` 是名称白名单、`customTools` 才是工具定义；SDK 自带工具循环。标准 skill metadata 不含全文，自动提示还依赖 `read/bash` 活动工具，显式 `/skill:name` 从文件读取。因此“安装官方技能”与“嵌入 Web Harness”不是同一步；应用自己的有限指南加载方式更容易与现有运行边界匹配。[已安装 SDK 声明](../../apps/web/node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.d.ts)、[Skill 类型](../../apps/web/node_modules/@earendil-works/pi-coding-agent/dist/core/skills.d.ts)、[系统提示实现](../../apps/web/node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js)

首版不必完整恢复所有 Pi 内部事件，也能做可靠追问：独立保存 `datasetId/modelVersion/dataVersion`、指标/维度/筛选/期间、`resultId` 等查询上下文，每次追问用该上下文重新执行；结果行和精确计算由查询层保管。若以后需要长任务续跑和完整工具审计，再采用 Pi `SessionManager` 的 entries 导出/恢复。浏览器回传的查询参数仍需服务端校验，agent 提示词不决定工具权限。摘要只辅助理解意图，不能作为数字的来源。

### 部署与现有证据

根项目明确 Node 24；聊天 `maxDuration=120`，代码总取消预算110秒，涵盖摘要、工具、最终生成与修复。Wren WASM 的资源定位、数据文件、内存生命周期必须进入 Next.js 生产打包验证。Python core 可以在提供 Python 的自托管宿主内由受控 worker 执行，也可以独立部署后通过内部 HTTP 调用；后者同样不等于 MCP。当前 Node 服务没有自动包含 Python 的运行/打包配置，不能直接承诺随当前部署上线。[根配置](../../package.json)、[Next 配置](../../apps/web/next.config.ts)、[路由预算](../../apps/web/app/api/ai-chat/route.ts)

历史记录曾提到 Vercel 配置，但本轮未查询部署平台或读取环境值，不能据此断言当前生产配额、持久文件系统或多进程能力。文件分析的数据导入和保存需独立于聊天请求，不能把几十万行文件塞入当前512000字节聊天请求或浏览器会话存储。

本轮核对了历史探针脚本及结果，未复跑：[Python probe](evidence/wren-embedding/probe.py)、[结果](evidence/wren-embedding/result.json)、[WASM benchmark](evidence/wren-wasm-benchmark/bench.mjs)、[结果](evidence/wren-wasm-benchmark/results.json)。Python 路径曾跑通计算字段、Cube 聚合、追问过滤、未知指标和非 MDL 表拒绝。WASM 0.4.1 在 M2 Max/64GiB 上对五列合成单表做10万/100万行聚合，CSV/Parquet 热查询约8/38毫秒，百万行进程峰值 RSS 约436–476MiB。此证据不包含 LLM、复杂 join、真实业务、并发或服务器打包，不能换算成线上问答延迟或容量承诺。

### 推荐验证顺序

1. 先选一个真实业务主题，确认数据源、更新方式、指标粒度和20–30个有标准结果的问题。历史“几十万行定期导入”仅作为暂定估算条件。
2. 文件输入且接受 DataFusion 时优先验证 WASM；明确需要 DuckDB/外部数据库/目标 SQL 时选 Python core。若 WASM 的排序/时间/连接能力无法覆盖问题集，切换执行器，不同时建设两套。
3. 用 Pi 原生工具贯通查询与 OpenUI，检查中文口径澄清、多轮筛选、金额精度、时间边界、Top N 与完整总量、空结果、重复 join、超时取消和数据版本切换。
4. 在实际部署环境测量冷启动、单次查询、整轮响应、模型 tokens 和并发内存。达到标准结果一致、数字展示一致、失败可重试后，再扩大数据范围。

建议是先做 **2–4 人日的完整链路验证**，通过后交付 **累计7–12人日的首版**。数据上传管理、自由接库、多租户或企业权限属于范围扩展，应在具体需求明确后单独评估。

持续成本按 `宿主/存储/数据更新 + LLM输入输出与重试 + 可选embedding/索引 + 运维与回归` 分开预算。Python core/WASM 无强制托管 Wren 请求收费，但仍有宿主与 Pi 模型费用；Cloud 则加订阅/API balance，不能用 web credits 直接抵 API。[包依赖](https://github.com/Canner/WrenAI/blob/wren-v0.15.0/core/wren/pyproject.toml)、[billing](https://docs.getwren.ai/cp/guide/account/billing)

本轮不报告托管价格数字：官方 [pricing](https://www.getwren.ai/pricing) 与 [billing](https://docs.getwren.ai/cp/guide/account/billing) 对 rollover/web credit 的细节存在不同说法，pricing 的可读内容未完整给出当前 API 数字费率。能确认的边界是：API credits 与 web credits 分开，API 余额耗尽会阻止请求，API access 至少 Essential Cloud，Enterprise Plus 自托管需商业报价。接入前应按所选模式实际后台/合同核定，不引用搜索摘要给出“每次问答固定多少钱”。[API access](https://docs.getwren.ai/cp/guide/api-access/overview)

## 尚未验证与下一步的决策门槛

1. **当前应用集成**：已核对本地聊天实现与 Pi 1.0.2 安装接口，确认工具/技能关闭、流与存储的接入点；未修改应用，未执行真实模型工具调用、OpenUI 结果呈现或生产部署验证。
2. **部署**：Python wheel/系统库/子进程是否可随目标宿主发布，或 WASM 资产追踪、冷启动、常驻内存和 concurrency 是否可控；未对 Vercel/其他 Serverless 运行作承诺。官方“GenBI 可部署 Vercel/Cloudflare”指生成的浏览器 dashboard，不证明本项目 Python query 后端可原样部署。[GenBI guide](https://github.com/Canner/WrenAI/blob/2cc843fd87d6cfe9831554721559018dda2938a0/docs/core/guides/genbi.md)
3. **真实数据与业务口径**：当前规模、数据源、刷新方式、多表关系/金额/时间类型未知；旧几十万行假设需重确认。初次验收应覆盖错误 join 翻倍、去重计数、空值/零分母、时间边界、Top N、追问筛选和模型/数据版本变化。
4. **能力选择**：若必须 DuckDB 或目标方言 SQL 审核，优先 Python/native；若接受 DataFusion 与有界文件查询，可验证 WASM。WASM 0.4.1 的 Top N 排序缺口须在选型中明确解决。
5. **模型预算**：智谱标准 API 的模型、工具能力、JSON输出、超时、重试与实际用量未测试；Coding Plan 不含 embedding 的结论不能靠猜测，网站场景应按 FAQ 另核计费资格。
6. **完整产品 API**：Cloud v2 完整 schema、认证/限流、SQL row limits、上传文件路径及自托管 Enterprise API 合同未核定；旧 OSS REST 的稳定性/认证也没有做线上测试。
7. **迁移维护**：旧 `legacy/v1` 与 `v1-final` 不是同一个提交；main 文档与发布包可能不同；多个镜像版本、Python/native crate 版本、WASM 0.4.1 应分别锁定。当前许可表不能追溯覆盖旧 AGPL 产品。

当前可做的下一步是先选上述两种 core 执行器之一，再用一个审核过的数据主题验证 Pi 原生工具调用和真实聚合结果；不需要先引入 MCP 或另一套聊天界面。
