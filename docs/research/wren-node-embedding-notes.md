# Wren 的 Node/TypeScript 嵌入边界

核查日期：2026-09-26。Node WASM 路径已查阅官方源码、npm registry 和发布类型，未运行；Python SDK 路径已在隔离环境通过 Node 子进程实际执行。未验证 Next.js 打包。

后续更新：已实际运行 Node WASM 0.4.1 的 10 万/100 万行文件导入与聚合探针，见 [存储与性能实测](wren-wasm-storage-notes.md)。用户已明确首版是“几十万行以内、定期导入文件”，这一范围可优先验证 Wren Node + 持久文件 + 复用内存表；仍未验证 Next.js 打包与真实数据。

## 结论

**Wren 有实际发布、官方给出 Node 用法的 npm 包，可以嵌入当前项目的 Node 服务端；但这个包执行的是 DataFusion WASM，并非把 SQL 交给原生 DuckDB。** 如果必须保留 DuckDB 为查询执行器，当前 npm 公共 API 不能直接承担“Wren 编译 → DuckDB 执行”链路，需选原生 binding/本地 worker 路径，或自行维护 Rust 导出与方言适配。

| 问题 | 核查事实 |
| --- | --- |
| npm 是否真实可用 | registry 的 `@wrenai/wren-core-wasm` latest 为 **0.4.1**，发布于 2026-05-15，Apache-2.0，`engines.node >=16`，ESM；包解压大小 71,470,172 字节。[registry](https://registry.npmjs.org/@wrenai%2fwren-core-wasm) |
| 是否仅支持浏览器 | **不是。** 官方 README 有 Node.js usage；必须读取 WASM 文件并以 `BufferSource` 传给 `WrenEngine.init({ wasmUrl })`。默认初始化走 `file://` fetch，Node 会失败。[README](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/README.md#nodejs-usage) |
| Node 支持证据强度 | 官方 `node:test` 覆盖初始化、JSON/CSV/Parquet 注册、MDL、cubeQuery 及 set operators；发布工作流在 Node 24 执行这些测试后发布。这是仓库测试证据，不是本项目运行结果。[测试](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/sdk/tests/index.test.mjs)、[发布工作流](https://github.com/Canner/WrenAI/blob/main/.github/workflows/publish-wren-core-wasm.yml) |
| SDK 是什么 | `core/wren-core-wasm/sdk` 是同一个 npm 包的 TypeScript wrapper，不是独立 DuckDB connector。公开方法包括 `registerJson/registerCsv/registerParquet/loadMDL/query/cubeQuery/listCubes/free`。[已发布类型](https://unpkg.com/@wrenai/wren-core-wasm@0.4.1/dist/index.d.ts) |
| `cube_query_to_sql` 是否导出 | **没有。** Rust `cubeQuery` 内部调用它生成 SQL，随后立刻调用自身 `query` 执行；JS API 和 WASM `InitOutput` 都没有独立编译方法。[Rust L643–659](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/src/lib.rs#L643-L659)、[已发布 WASM 绑定类型](https://unpkg.com/@wrenai/wren-core-wasm@0.4.1/dist/wren_core_wasm.d.ts) |
| 真正执行引擎 | DataFusion `SessionContext`，单线程 WASM；MDL 以 `Mode::LocalRuntime` 改写，再由 DataFusion 执行。源码明确该 WASM 分支不包含用于外部执行器的 SQL unparser / dialect transpilation。[源码](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/src/lib.rs)、[依赖说明](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/Cargo.toml) |
| 能否连原生 `.duckdb` 文件 | 当前公共 API 没有 DuckDB 文件/连接注册入口。输入是 JSON、CSV、Parquet 字节或远程 Parquet。导出 DuckDB 数据再注册到 WASM 是可设计的桥接，但数据被复制到 DataFusion，计算仍由 DataFusion 完成。[已发布 API](https://unpkg.com/@wrenai/wren-core-wasm@0.4.1/dist/index.d.ts) |

## 版本与实施限制

- **不要用 main 分支 API 推断 npm 0.4.1。** 当前源码 `CubeQueryInput` 已有 `orderBy`，但已发布 0.4.1 的类型没有此字段。锁定版本后应按发布产物做验收。[main SDK](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/sdk/src/index.ts)、[0.4.1 类型](https://unpkg.com/@wrenai/wren-core-wasm@0.4.1/dist/index.d.ts)
- WASM `cubeQuery` 的中间 SQL 仍可能引用 MDL 模型；简单增加一个返回该字符串的导出，不等于已经得到可直接执行的 DuckDB SQL。还需要语义重写和方言处理。此项是依据 `cubeQuery → query → DataFusion analyzer` 流程作出的工程判断。[实现](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/src/lib.rs#L643-L659)
- 官方建议小规模本地数据优先 inline 模式；URL 模式要求 HTTP Range 支持。README 的约 50 MB 建议不是经过本项目测试的容量保证。[README](https://github.com/Canner/WrenAI/blob/main/core/wren-core-wasm/README.md)
- 对当前 Next.js 项目，服务端加载 WASM 资产的位置、部署文件追踪、初始化复用、内存与响应延迟都尚未验证。不要把“官方 Node 测试存在”表述成“已在当前项目集成成功”。

## 决策建议

如果用户接受 DataFusion 执行，npm WASM 适合验证“同项目、无独立服务”的最短集成；若 DuckDB 是明确要求，优先在同仓库、同部署中接 Wren 原生编译能力的本地 worker，现有 Pi 仍负责 Agent 流程。无须因此迁入 Wren 完整 UI 或独立部署全套 WrenAI；Python binding 的运行证据见下文。

## 已验证的 DuckDB 嵌入方式

**同仓库、同部署可行；纯 Node 同进程 + DuckDB 的官方现成接法，本次没有找到。** Rust 核心有已发布的 Python binding `wren-core-py`，`wrenai` 的 `WrenEngine` 可直接接收 MDL 与连接配置，不强制经过 CLI 项目初始化、MCP、HTTP 或另一套 Agent 框架。[Python Engine 源码](https://github.com/Canner/WrenAI/blob/main/core/wren/src/wren/engine.py)、[Python binding](https://pypi.org/project/wren-core-py/0.8.0/)

拟放在现有仓库的结构：

```text
apps/web/                    现有界面、API、Pi Harness
packages/ai-analytics/
  src/                       Pi 工具适配与 Node 调用入口
  semantic/                  审核后的 MDL 与业务口径
  python/                    Wren SDK 调用、锁定的 Python 依赖
  data/                      DuckDB 文件（服务端数据）
```

Pi 自定义工具 → Node `spawn` 管理本地 Python 子进程 → `cube_query_to_sql` → `WrenEngine.query` → DuckDB → JSON 结果返回 OpenUI。这是同一应用内的语言边界；无需新建站点、仓库、监听端口或 Docker 服务。Python 环境仍须随部署提供，不能把“无需独立服务”理解成“只有 Node 依赖”。

首版可以按请求启动子进程，避免自己实现常驻进程管理；若测得启动成本影响体验，再复用有明确生命周期的进程或采用上游 stdio MCP。并发上限、进程退出、取消与超时必须在落地时完成。所选部署环境必须允许子进程及原生依赖；Edge runtime 不适用，Serverless 也不能未经平台实测就承诺支持。

### 本地复现证据

环境：macOS、Node v24.21.0、Python 3.13.11、wrenai 0.15.0、wren-core-py 0.8.0、DuckDB 1.5.5、sqlglot 30.19.0、pyarrow 25.0.1。所有数据均由探针生成，与业务数据无关；依赖装在 `/tmp` 的虚拟环境，未修改 workspace 的 package.json 或 pnpm-lock.yaml。

探针：[Node 启动与断言](evidence/wren-embedding/probe.mjs)、[Wren/DuckDB 查询与断言](evidence/wren-embedding/probe.py)、[实际输出](evidence/wren-embedding/result.json)。覆盖：MDL 物理表映射、计算字段、Cube 聚合、取消状态过滤、追加地区筛选、未知指标拒绝、非 MDL 表拒绝，以及 Node/Python JSON 往返。没有调用 LLM、监听端口或启动 Wren UI。

复现命令（仓库根目录，虚拟环境目录自行选择）：

```sh
uv venv /tmp/wren-embed-check --python 3.13
uv pip install --python /tmp/wren-embed-check/bin/python 'wrenai==0.15.0' 'wren-core-py==0.8.0' 'duckdb==1.5.5' 'sqlglot==30.19.0' 'pyarrow==25.0.1'
WREN_PROBE_PYTHON=/tmp/wren-embed-check/bin/python node docs/research/evidence/wren-embedding/probe.mjs
```

发现一个版本细节：本次 MDL 写 `DECIMAL(12,2)` 或 `DECIMAL(12, 2)` 时，计算字段报 `Utf8 - Utf8` 类型错误；将 MDL 类型改为 `decimal` 后通过，底层 DuckDB 表仍为 DECIMAL(12,2)。这仅确认当前探针可运行，不代表已验证所有精度、舍入及类型映射，生产金额数据需专项验收。

这次验证证明了**可在当前 Node 应用旁嵌入并调用 Wren + DuckDB**，不等于已经完成 Next.js 路由、Pi 模型工具调用、并发取消或生产部署验收。前述 npm WASM 分支仍只做了源码与发布物核查。
