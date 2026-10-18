# Wren core SDK 与宿主技能证据

本文件是 [Wren 研究入口](wren-chatbi-integration-source-review.md) 的专题证据；结论、版本表与模块边界统一在入口核对。以下保留实施前研究原文，所有“当前”“本轮”和估算条件均属于当时快照。

核验日期：**2026-10-05**。本轮核对官方文档、GitHub 源码、npm/PyPI 发布元数据、当前应用和已安装 Pi SDK；未安装依赖、运行服务、调用模型或读取业务数据，未修改应用代码。仓库基线为 `main` / `2ba8359`，开始研究时工作区干净，`git fetch origin` 后与 `origin/main` 一致。结论是选型与工作量估算，尚未实施。

> 当前实现：远端 MCP 接入已于 2026-10-05 合并 [PR #44](https://github.com/indie-builder/personal-design/pull/44)（`2eeadf2`）。现在修改智能问数时，从 [AI 问答运行链路](../design/execution/ai-chat.md#运行链路)与[配置](../design/execution/ai-chat.md#配置)进入；工具注册和桥接见 [analytics-tools.ts](../../apps/web/lib/analytics-tools.ts)、[analytics-mcp.ts](../../apps/web/lib/analytics-mcp.ts)。下文保留实施前的选型快照，SDK／WASM 建议不代表当前应用架构。

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
