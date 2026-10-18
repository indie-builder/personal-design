# Wren 项目接入与验证计划

本文件是 [Wren 研究入口](wren-chatbi-integration-source-review.md) 的专题证据；结论、版本表与模块边界统一在入口核对。以下保留实施前研究原文，所有“当前”“本轮”和估算条件均属于当时快照。

核验日期：**2026-10-05**。本轮核对官方文档、GitHub 源码、npm/PyPI 发布元数据、当前应用和已安装 Pi SDK；未安装依赖、运行服务、调用模型或读取业务数据，未修改应用代码。仓库基线为 `main` / `2ba8359`，开始研究时工作区干净，`git fetch origin` 后与 `origin/main` 一致。结论是选型与工作量估算，尚未实施。

> 当前实现：远端 MCP 接入已于 2026-10-05 合并 [PR #44](https://github.com/indie-builder/personal-design/pull/44)（`2eeadf2`）。现在修改智能问数时，从 [AI 问答运行链路](../design/execution/ai-chat.md#运行链路)与[配置](../design/execution/ai-chat.md#配置)进入；工具注册和桥接见 [analytics-tools.ts](../../apps/web/lib/analytics-tools.ts)、[analytics-mcp.ts](../../apps/web/lib/analytics-mcp.ts)。下文保留实施前的选型快照，SDK／WASM 建议不代表当前应用架构。

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

实现依据：[pi-chat.ts](../../apps/web/lib/pi-chat.ts)、[route.ts](https://github.com/indie-builder/personal-design/blob/2ba8359/apps/web/app/api/ai-chat/route.ts)、[前端流](../../apps/web/lib/use-pi-chat.ts)、[存储](../../apps/web/components/ai-chat/use-saved-chat.ts)、[生成协议源](../../apps/web/scripts/generate-openui-prompt.mjs)。相关源码已只读核验；没有实际调用新工具。

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

根项目明确 Node 24；聊天 `maxDuration=120`，代码总取消预算110秒，涵盖摘要、工具、最终生成与修复。Wren WASM 的资源定位、数据文件、内存生命周期必须进入 Next.js 生产打包验证。Python core 可以在提供 Python 的自托管宿主内由受控 worker 执行，也可以独立部署后通过内部 HTTP 调用；后者同样不等于 MCP。当前 Node 服务没有自动包含 Python 的运行/打包配置，不能直接承诺随当前部署上线。[根配置](../../package.json)、[Next 配置](https://github.com/indie-builder/personal-design/blob/2ba8359/apps/web/next.config.ts)、[路由预算](https://github.com/indie-builder/personal-design/blob/2ba8359/apps/web/app/api/ai-chat/route.ts)

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
