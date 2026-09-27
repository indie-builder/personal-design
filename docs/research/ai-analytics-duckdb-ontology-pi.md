# 智能问数：DuckDB + Ontology + Pi 选型与集成方案

调研日期：2026-09-26。状态：**方案待定，未实施**。

用户最终确认的目标是结构化数据的“智能问数”：DuckDB 做数据层，Ontology 做业务语义层，复用现有 Pi Coding Agent Harness。默认“生成式 UI 助手”保留，新增第二个内置智能体。

后续嵌入核查：**可以放在本仓库和同一部署单元中，无需独立网站或 HTTP 服务。** 已在隔离环境跑通 Node → Python 子进程 → Wren SDK → DuckDB；官方也有 Node WASM 包，但执行器为 DataFusion，不是 DuckDB。下文 MCP 是可选接入方式，不是集成前提；最新边界与复现证据见 [Wren 嵌入核查](wren-node-embedding-notes.md)。应用内集成和 Next.js 生产打包仍未实施。

最新数据规模：用户确认“几十万行以内、定期导入文件”。已完成 Wren Node WASM 文件路径的性能探针；对于这一使用范围，建议优先验证**纯 Node + Wren WASM + 磁盘文件持久化**，加载一次并复用内存表，避免每次问答重复解析。文件可先保留 CSV，需要持久列式格式时使用 Parquet。若仍明确要求 DuckDB 负责存储和执行，则保留上面的 Python SDK 路径，不声称 WASM 能直连 DuckDB。[执行原理、测量方法及结果](wren-wasm-storage-notes.md)

## 结论

**优先验证 WrenAI 的 core 语义引擎 + DuckDB + 现有 Pi。** Wren 的 MDL 负责业务模型、关系、计算字段与指标，Pi 理解自然语言并调用结构化查询工具，现有 OpenUI 呈现结果。只使用语义引擎与工具接口，不迁入另一套聊天应用或替换 Harness。

如果第一版只有少量指标、维度和聚合，**Boring Semantic Layer（BSL）是更轻的备选**。Ontic 更贴近对象/关系/动作本体平台，但本次核查不足以证明它已具备完整指标分析能力；ontology-agent 的设计贴题，却缺少明确开源许可且编译器有领域硬编码。

这是根据官方资料、源码与本地接口提出的工程判断，尚未对目标数据进行运行验证。数据源、业务领域、规模及刷新频率尚未确定，不据此承诺性能或交付工期。

## GitHub 候选比较

| 项目 | 已核查能力 | 本体/语义层边界 | 采用建议 |
| --- | --- | --- | --- |
| [Canner/WrenAI](https://github.com/Canner/WrenAI) 的 core | MDL 模型、主键、关系、计算字段；Cube 指标、维度、时间粒度；DuckDB 连接；MCP 的上下文、计划及结构化查询工具 | 业务语义建模与 SQL 规划，不等同完整 OWL 推理器 | **首选验证**：采用核心语义层与 query_cube，保留 Pi/OpenUI |
| [boringdata/boring-semantic-layer](https://github.com/boringdata/boring-semantic-layer) | 基于 Ibis，支持 DuckDB；维度、度量、关联、YAML；MCP 查询及期间对比 | 分析型语义层，强项是指标聚合；不是通用对象本体平台 | **轻量备选**：少量分析模型更合适；只使用模型/查询能力 |
| [pkupt/Ontic](https://github.com/pkupt/Ontic) | 对象类型、属性、链接、动作；DuckDB backing tables；过滤/排序/分页 SQL 下推 | Foundry 风格业务对象本体，所查核心工具偏对象查询及动作 | 可参考建模方式，不直接选为完整问数引擎 |
| [klsdcv/ontology-agent](https://github.com/klsdcv/ontology-agent) | YAML 实体、grain、指标、别名、关系基数；QueryPlan 校验后生成 DuckDB SQL | 与需求贴近，但编译器硬编码电商 Olist 字段与查询 | **设计参考**；未发现 LICENSE，不作为有明确开放许可的代码依赖 |
| [sounkou-bioinfo/pi-bio-agent](https://github.com/sounkou-bioinfo/pi-bio-agent) | Pi 工具调用 DuckDB，结构化参数、取消信号、结果行数限制 | 科研工作台；ontology 标签不能证明具有通用业务语义层 | Pi–DuckDB 接入参考；接口版本与本项目不同 |

### 首选依据与限制

Wren 的 MDL 定义逻辑模型与物理表映射、主键、关系和计算字段；Cube 定义度量、维度与时间维度。可以让模型选择“哪个指标、按什么维度、哪个期间”，由引擎生成 SQL，减少临时猜测业务口径。[MDL 文档](https://github.com/Canner/WrenAI/blob/main/docs/core/reference/mdl.md)、[Cube 文档](https://github.com/Canner/WrenAI/blob/main/docs/core/guides/cubes.md)

Wren 已有 `query_cube`、`list_cubes`、`describe_cube`、`list_models`、`describe_model` 等 MCP 工具；支持 stdio 和 Streamable HTTP。HTTP 默认仅监听本机，当前文档说明没有 bearer-token 认证，适合先作为后端内网/本机服务；不能直接当作公共 API 暴露。[MCP 文档](https://github.com/Canner/WrenAI/blob/main/docs/core/guides/mcp.md)、[工具源码](https://github.com/Canner/WrenAI/blob/d26ab6af5e7e641f3e67f3ea9125486f5425fd30/core/wren/src/wren/mcp_server.py)

这些能力不自动保证所有业务问题都正确：主键、连接基数、指标粒度及时间口径仍要人工确认，并通过已知结果验收。本次只核对功能存在，没有验证复杂跨事实表查询的正确性。

旧 [Canner/wren-engine](https://github.com/Canner/wren-engine) 已归档并迁到 WrenAI 的 `core/`，实施时应跟踪新仓库，锁定已验证的版本。WrenAI 是分路径许可：`core/**`、`sdk/**` 等为 Apache-2.0，文档为 CC BY 4.0；具体发布包以其 manifest 为准。[迁移说明](https://github.com/Canner/wren-engine/blob/main/README.md)、[许可映射](https://github.com/Canner/WrenAI/blob/main/LICENSE)

BSL 的 MCP 已提供模型描述、按维度/度量查询和 `compare_periods`；YAML 可表达语义模型。采用它无需替换成其内置 Agent，Pi 可以作为调用方。[BSL 模型配置](https://github.com/boringdata/boring-semantic-layer/blob/main/docs/md/doc/yaml-config.md)、[MCP 查询工具](https://github.com/boringdata/boring-semantic-layer/blob/main/docs/md/doc/query-agent-mcp.md)

### 为什么其他项目只作参考

- **ontology-agent** 的设计值得借鉴：指标包含默认过滤、时间字段、允许维度，关系包含基数和重复聚合风险；但 compiler 中存在 `FROM orders o` 和固定字段映射。[指标定义](https://github.com/klsdcv/ontology-agent/blob/main/ontology/metrics.yml)、[关系定义](https://github.com/klsdcv/ontology-agent/blob/main/ontology/relationships.yml)、[compiler](https://github.com/klsdcv/ontology-agent/blob/main/src/ontology_kit/compiler.py)
- **Ontic** 当前 AIP 工具偏列出类型、描述对象、筛选对象和执行写动作，不能仅凭 README 推断具备复杂聚合及多轮分析。其查询边界也需要重新审查，不能把宣传的安全性当成验收结果。[AIP 实现](https://github.com/pkupt/Ontic/blob/main/backend/app/aip.py)、[对象查询](https://github.com/pkupt/Ontic/blob/main/backend/app/ontology/resolver.py)
- **Pi Bio** 的工具类型来自较新的 `@earendil-works/pi-agent-core` / AgentHarnessTool，而当前项目是 Pi Coding Agent 0.87.1 的 ToolDefinition。只能借鉴调用与取消设计，不能直接拷贝接口。[Pi Bio tools](https://github.com/sounkou-bioinfo/pi-bio-agent/blob/main/apps/api/src/tools.ts)
- 另看了 [Loom](https://github.com/shinydrift/loom-ontology)：YAML 本体与类型化工具值得参考，但它以 Iceberg 为存储基础，DuckDB 是计算适配器，Query IR 主要是对象查找/搜索/遍历，当前需求不必引入这一层。[IR](https://github.com/shinydrift/loom-ontology/blob/main/src/loom/query/ir.py)

## 本体要定义的内容

这里建议先采用“业务对象本体 + 分析语义模型”，以可执行查询为目标。没有明确规则推理需求时，不先引入 RDF 三元组库或完整 OWL 推理系统。

以下用订单分析举例，只说明模型结构，不代表已选择用户的数据：

| 层次 | 必须明确的内容 | 示例 |
| --- | --- | --- |
| 业务对象 | 对象含义、主键、数据粒度、字段类型 | 订单一行代表一张订单；订单明细一行代表一条商品项 |
| 对象关系 | 连接键、方向、基数、允许路径 | 客户 1:N 订单；订单 1:N 明细 |
| 指标 | 公式、聚合方式、单位、默认过滤 | 净销售额是否扣退款；订单数是否去重；取消订单是否排除 |
| 维度与时间 | 可分组字段、时间字段、时区、期间边界 | 支付时间或下单时间；自然月或最近 30 天 |
| 业务术语 | 中文名称、别名、解释、歧义处理 | “销售额”映射哪个指标；口径不明确先追问 |
| 查询约束 | 可见模型/字段/行、最大范围、不可组合项 | 禁止跨不兼容粒度直接求和；只查询允许的数据集 |

一份已审核的 MDL/语义模型作为唯一来源。展示给 Pi 的说明、指标选择和执行约束都从它派生，不再平行维护另一份容易漂移的提示词本体。描述只是上下文；指标公式、连接规则与权限必须在执行层生效。

## 建议架构

```text
CSV / Parquet / 业务数据库导出
             ↓
       DuckDB 数据快照
             ↑
    Wren 核心语义引擎（MDL）
   对象、关系、指标、维度、口径
             ↑
   Pi 自定义工具 → MCP 适配
             ↑
    智能问数 Agent / 多轮追问
             ↓
  查询结果 + 口径 + 数据版本
             ↓
       现有 OpenUI 图表与表格
```

最小部署：现有 Next.js/Node 服务，加一个提供语义查询的 Wren Python 进程及 DuckDB 文件。Wren 提供服务端工具，Pi 继续负责 Agent 循环，不引入第二个 AI Harness。DuckDB 不要求单独的数据库守护进程；Docker 只是将来可选的部署包装。

数据导入与问数分开：先构建新 DuckDB 文件，做类型/唯一键/连接基数与数据质量校验，再发布只读快照。常规原生文件模式下，多进程可以同时只读；一个进程写入时不能假定另一个进程可同时安全读写该活动文件。[DuckDB 并发规则](https://duckdb.org/docs/current/connect/concurrency)

## 如何接进现有项目

已查本地 `@earendil-works/pi-coding-agent@0.87.1`。工具可用 `customTools: ToolDefinition[]` 注册，`tools` 是名称白名单；无需为了做问数先升级 Harness。[已安装 SDK](../../apps/web/node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.d.ts)、[ToolDefinition](../../apps/web/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts)

| 现有位置 | 核查结果 | 计划改动 |
| --- | --- | --- |
| [packages/ai-chat/src/index.ts](../../packages/ai-chat/src/index.ts) | 默认 agent 为“生成式 UI 助手”，类型只有提示词等基础字段 | 增加稳定 ID 的“智能问数”预设；数据集范围与服务端工具权限独立管理 |
| [apps/web/components/ai-chat.tsx](../../apps/web/components/ai-chat.tsx) | localStorage 初始化只补回现有默认 agent | 幂等加入新预设，保留用户会话；问数使用自己的示例问题 |
| [apps/web/lib/pi-chat.ts](../../apps/web/lib/pi-chat.ts) | 当前 `noTools:'all', tools:[]` | 问数阶段用 `customTools`、`noTools:'builtin'`、显式工具白名单；自建普通 agent 不因提示词获得数据工具 |
| [apps/web/app/api/ai-chat/route.ts](../../apps/web/app/api/ai-chat/route.ts) | 客户端传入 agent.prompt；所有 text_delta 被合成一个 OpenUI 输出 | 服务端识别预设和数据权限；分析过程与最终展示分开 |
| [apps/web/lib/use-pi-chat.ts](../../apps/web/lib/use-pi-chat.ts) | 已有多轮历史、取消、摘要与展示流 | 复用这些机制；补查询标识、语义模型版本、数据版本、结构化筛选上下文 |

建议将数据与语义模型放在 `packages/ai-analytics`，通过包 API 暴露可用模型和查询能力，App 不直接读 DB 或拼接文件路径；仍在现有 AI 问答页面中提供，不注册新的站点产品。

### Pi 的最小工具集

首版只暴露三个受控业务工具，名称是本项目拟定接口，不是声称上游已经原样提供：

1. `list_analytics_models`：返回可访问模型/指标概览，映射 Wren 的 list_models/list_cubes。
2. `describe_analytics_model`：返回已选模型的指标、维度、关系、口径，映射 describe_model/describe_cube。
3. `query_metrics`：接收指标、维度、过滤条件、期间、排序与上限，校验后映射 Wren query_cube。

Pi 工具通过服务端 MCP 客户端调用 Wren；当前项目尚无这段桥接，不能把“Pi 支持自定义工具”写成“已经支持 Wren MCP”。使用固定目标和固定工具，不开放远程地址、任意文件路径或 shell；上游 JSON schema 与 Pi TypeBox 参数之间采用三个显式适配，不先建设通用工具插件框架。

首版常规问数走结构化查询；不暴露通用 `run_sql`。复杂探索式 SQL 若确有需求再加入 AST/模型/函数白名单与权限校验；数据库只读并不能阻止 SELECT 调用外部文件/网络函数，MCP 的 readOnlyHint 也不是安全边界。数据范围、函数与模型访问限制都应由执行服务保证。

### 一次问数的过程

以“上个月各渠道净销售额，和前一个月相比如何”为示例：

1. Pi 找到指标定义；若“净销售额”未注册或时间口径有歧义，先澄清。
2. 将两个期间变为明确的起止日期，按统一时区及数据截止时间解释，固定相同过滤条件。
3. 调用语义查询取得两个期间的渠道聚合；差额/变化率由确定性计算层处理，上一期为 0 的比例结果需明确为不可计算，不能让模型心算。
4. 返回表格/图表、结论，以及采用的指标口径、期间和数据更新时间。
5. 用户追问“只看华东”时保留指标和比较期间，更新筛选后重新执行查询。

数字必须来自结构化结果。模型可以解释和选择呈现方式，不能自行填补不存在的数值；图表、表格与计算结果校验一致。若只查了 Top N，不能把其合计当作全量总计。SQL 可以作为按需查看的分析依据，但不占据默认回答。

### OpenUI 与工具循环需要的处理

当前路由将所有 assistant text_delta 直接拼入 OpenUI。增加工具调用后，模型的中间说明可能混入展示协议，因此不能仅改 `noTools` 就认为接入完成。

建议首版拆成查询阶段与展示阶段：Pi 用工具获取真实结果；关闭工具后，以结构化结果生成最终 OpenUI 流。查询阶段不把内部文字交给 OpenUI parser；保留已有的取消/超时。这样会多一次最终生成调用，需要测量延迟。UI 修复提示也要按智能体区分，去掉默认案例专用的业务阶段要求。

会话中保存模型/数据版本、已执行查询参数与结果标识。摘要帮助理解追问，不成为数据依据；后续问题重新执行。当前智谱配置能否稳定完成这些工具调用，也属于接入 PoC 的验收项，尚未实测。

## 首轮验证与决策标准

范围建议：一个真实业务主题、3–5 张关联表、5–10 个明确口径指标、20–30 个标准问题。未选业务数据前，不把现有生成式 UI 的虚构试用样本当真实分析数据。

先准备标准查询与结果，再做集成验证。失败清单至少包含：

- 订单与明细连接造成金额翻倍；COUNT 与 COUNT DISTINCT 混淆。
- 退款、取消、空值和零分母处理错误；混合币种或单位。
- 自然月与最近 30 天、支付日与下单日混淆；不完整本月误作完整期间。
- 跨事实表连接、非法维度组合与错误汇总粒度。
- 多轮追问丢失筛选；无数据回答成 0；超范围数据访问。
- 超时/取消后查询仍持续；Top N 结果被解释成全量。
- 表格与图表的数字不同；缓存/摘要复用过期结果。

同一数据集、同一问题集比较 Wren 与 BSL，记录标准结果一致性、口径解释、追问成功率、耗时及模型用量。第一轮先验证首选 Wren；只有部署或模型表达能力不适合时才运行 BSL 对照，不并行建设两套生产实现。

选型通过后再做应用改动。按仓库规则先准备可重复验收，开发中跑定向 E2E，完成后跑要求的全套；浏览器使用项目指定 ego-browser。本轮只做资料和本地源码核查，不运行模型、不安装服务、不改应用代码。

## 许可与维护快照

以下是调研日 GitHub API 和许可正文；push 时间不代表稳定版本或质量保证。

| 项目 | 许可 | archived | 最近 push（UTC） |
| --- | --- | --- | --- |
| WrenAI | core 为 Apache-2.0；文档等分路径 | false | 2026-09-25 |
| BSL | MIT | false | 2026-08-24 |
| Ontic | MIT（按正文） | false | 2026-08-25 |
| ontology-agent | 未发现 LICENSE | false | 2026-09-06 |
| Pi Bio | GPL-2.0-or-later（按正文） | false | 2026-09-07 |

来源：[WrenAI API](https://api.github.com/repos/Canner/WrenAI)、[Wren 许可](https://github.com/Canner/WrenAI/blob/main/LICENSE)、[BSL API](https://api.github.com/repos/boringdata/boring-semantic-layer)、[Ontic API](https://api.github.com/repos/pkupt/Ontic)、[Ontic 许可](https://github.com/pkupt/Ontic/blob/main/LICENSE)、[ontology-agent API](https://api.github.com/repos/klsdcv/ontology-agent)、[Pi Bio API](https://api.github.com/repos/sounkou-bioinfo/pi-bio-agent)、[Pi Bio 许可](https://github.com/sounkou-bioinfo/pi-bio-agent/blob/main/LICENSE)。

本次关键源码快照：WrenAI `d26ab6af5e7e641f3e67f3ea9125486f5425fd30`；BSL `307c2e2ca91ccacf4386abf2323c043602983685`；Ontic `191a4d90fb116ea5ef354eeee8def653a0116e13`；Pi Bio `80c9bfae9c61bccf37f8bb1d4fcd84cfa0b93196`。
