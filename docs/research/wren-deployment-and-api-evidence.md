# Wren API、部署与许可证据

本文件是 [Wren 研究入口](wren-chatbi-integration-source-review.md) 的专题证据；结论、版本表与模块边界统一在入口核对。以下保留实施前研究原文，所有“当前”“本轮”和估算条件均属于当时快照。

核验日期：**2026-10-05**。本轮核对官方文档、GitHub 源码、npm/PyPI 发布元数据、当前应用和已安装 Pi SDK；未安装依赖、运行服务、调用模型或读取业务数据，未修改应用代码。仓库基线为 `main` / `2ba8359`，开始研究时工作区干净，`git fetch origin` 后与 `origin/main` 一致。结论是选型与工作量估算，尚未实施。

> 当前实现：远端 MCP 接入已于 2026-10-05 合并 [PR #44](https://github.com/indie-builder/personal-design/pull/44)（`2eeadf2`）。现在修改智能问数时，从 [AI 问答运行链路](../design/execution/ai-chat.md#运行链路)与[配置](../design/execution/ai-chat.md#配置)进入；工具注册和桥接见 [analytics-tools.ts](../../apps/web/lib/analytics-tools.ts)、[analytics-mcp.ts](../../apps/web/lib/analytics-mcp.ts)。下文保留实施前的选型快照，SDK／WASM 建议不代表当前应用架构。

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
