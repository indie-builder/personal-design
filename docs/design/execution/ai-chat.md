# AI 问答

第六个作品，入口 `/products/ai-chat`。下方配置、会话与组件契约为现行要求；当前启动与检查统一见 [验收索引](README.md)。本页末尾的历史结果和旧命令仅用于回溯，不能证明当前版本已通过验收。

## 界面与会话

桌面为居中480px的移动演示框，上下16px留白。外层「← AI 问答」与其他作品同样式，宽屏独立定位，不挤压演示框；不足800px预留72px页头防止重叠，639px以下取消框线。Menu、居中智能体、Plus 保留，创建页和会话抽屉都限定在演示框内。

手机字号、触控尺寸、中性主题、Albert Sans、成对动效遵循 DESIGN.md。输入区在最新消息区域显示，离开底部即收起；“回到最新消息”按钮水平居中且独立可用；向上滑动阅读时内层工具栏以180ms位移／淡出收起，反向滚动恢复，消息区高度不变。自动跟随回复不隐藏工具栏；键盘和减少动态效果即时切换。

生成期间显示等待状态，结束后显示复制与重新生成图标。复制渲染后的内容，不复制 OpenUI Lang。智能体仅有名称和系统提示词；头像从15张男生素材随机分配。会话、智能体、摘要及表单状态保存于当前浏览器 `personal-design:ai-chat:v2`，没有账号或跨设备同步。当前消息使用单个 `text` 字段；旧 v1 存储原地保留，不读取、不迁移、不覆盖。主题入口、保存位置说明、免责声明均不展示。

## 运行链路

- 后端：`@earendil-works/pi-coding-agent` 1.0.2 的 `AgentSession`，`ModelRuntime` 连接智谱 Coding Plan。
- 每次请求用 `SessionManager.inMemory()` 恢复已验证的历史与摘要，只将最新用户输入送进 `session.prompt()`；结束或中止即 dispose。没有跨实例全局 Map，适合 Vercel 冷启动。
- 关闭主机文件／终端工具、扩展、技能及项目上下文发现；只做问答，不开放官方 coding 示例中的主机操作能力。
- Pi `text_delta` 桥接为 OpenAI NDJSON；前端 `usePiChat` 用官方 `openAIReadableStreamAdapter` 解析。应用不使用 AI SDK；OpenUI 将其声明为仅供 vercelAIAdapter 使用的可选 peer dependency，锁文件已清除未使用的 AI SDK 及专属依赖链。
- 内置智能体按服务端固定能力表启用工具：`analytics` 使用包内权威提示词（覆盖客户端传入内容）并注册 8 个受控数据工具（[analytics-tools.ts](../../../apps/web/lib/analytics-tools.ts)），经 [analytics-mcp.ts](../../../apps/web/lib/analytics-mcp.ts) 用 `@earendil-works/pi-mcp` 连接远端 MCP Streamable HTTP（Bearer 认证、无状态、每请求新建客户端并在结束时关闭）；工具结果序列化为文本，超过 20000 字符截断并注明数据不完整，单工具 30 秒超时、单次回答 12 次调用上限。`ANALYTICS_MCP_TOKEN` 缺失时工具返回不可用提示由模型转述，请求不失败。
- 工具执行经 `tool_execution_start/end` 事件以裸 `tool_status` NDJSON 行（与 OpenAI chunk 并列，官方适配器静默跳过）驱动前端查询步骤条；工具执行前与执行期间的文本由服务端缓冲、首个工具开始时丢弃，仅末次工具后的文本进入结构校验；未触发工具的纯文本回答在 prompt 结束时一次性放行。前端收到工具开始即重置本地文本，与服务端对称。问数请求在最后一条用户消息尾部由服务端追加查询提醒（不写入会话历史），抑制长对话中模型凭历史直接作答的倾向。
- 流式文本首片段立即提交，后续按32ms窗口合并界面更新；完成、错误或停止时补齐尾部内容，卸载取消待执行回调。完整历史的本机写入按500ms窗口合并；结束、停止、页面隐藏或卸载时刷新待保存快照。非生成期的智能体与表单修改即时保存；读取失败不覆盖旧数据，写入失败保留现有错误提示。
- 输入检查角色、字段长度、消息数量、512KB体积及 Origin。上游错误不透出密钥或原始异常。
- 超过16条或24000字符时，用 Pi `completeSimple` 合并早期摘要，保留最近6条原文。摘要最多1500字，新摘要经 `x-ai-memory` 响应头回传，仅保存到 Conversation.memory。摘要失败不丢弃原始会话。

参考：[OpenUI Pi Harness](https://www.openui.com/docs/agent/agent-runtimes/pi)、[OpenUI headless](https://www.openui.com/docs/api-reference/react-headless)。

## 官方生成式 UI

见 [官方生成式 UI](ai-chat-rendering.md#官方生成式-ui)。

## 移动端按钮依据与项目取舍

见 [移动端按钮依据与项目取舍](ai-chat-rendering.md#移动端按钮依据与项目取舍)。

## 内置案例

默认「生成式 UI 助手」内置虚构案例“轻舟协作：小团队选型与落地”。系统提示词含三个档位的明确能力、推荐规则、试用样本及流程，不编造真实价格、采购或开通结果。用户直接提业务需求，不需说 OpenUI 或组件名。

| 阶段 | 业务目标 | 主要组件 |
| --- | --- | --- |
| 需求梳理 | 采集团队规模、项目数、能力诉求 | Form、Input、Select、RadioGroup、CheckBoxGroup、TextArea |
| 方案对比 | 推荐满足硬性要求的最低档 | Table、Card、CardHeader、TagBlock、Accordion、Button |
| 两周试用 | 规划阶段、日期、目标和责任人 | Steps、DatePicker、Slider、EditableTable |
| 效果复盘 | 观察趋势、前后对比与任务分布 | OverviewCardBlock、MetricIndicatorInline、Tabs、LineChart、BarChart、PieChart |
| 决策闭环 | 解释风险，选择并确认下一步 | Callout、OptionCards／RadioGroup、Form、Button |

首页入口为“从头帮我们选一套协作方案”“帮我们安排两周试用”“看看两周试用的效果”。本案例按当前业务需求展开，不把全部组件堆在一条回答；这不限制其他智能体仅回答内容或一次呈现必要的完整信息。完整库可用，不代表82个组件都需要在此案例逐个出现。

数据口径：50项任务，完成45／进行4／阻塞1；对照完成30／逾期12／交接18小时，试用逾期4／交接7小时。完成率90%，对照60%，提升30个百分点；14天累计趋势与总数一致。样本不代表用户的真实业务成果。

### 智能问数

第二个内置智能体分析虚构公司「星辰科技」的仿真 HR 数据（演示样本，非真实业务数据）。提示词约定工作流：每个分析任务先读取业务口径与快照日期；预置指标主题能回答的优先按主题查询；复杂口径先确认模型字段、构造只读 SELECT 并先校验再执行；单次回答工具调用尽量不超过 6 次，聚合优先，不拉取明细大表。每个数字注明口径与快照日期，查不到时解释原因并给出替代问法，不编造数字、不声称实时。界面呈现遵循官方组件契约，图表必须使用真实查询结果，结果受限或截断时说明数据不完整。问候与数据无关的问题直接文本回应，不调用工具。

查询期间在等待区显示工具步骤（运行／完成／失败），回答开始后收起。欢迎区示例为在职人数、部门分布与人力成本趋势三个入口。

工具与数据边界：8 个只读工具（读取口径、模型与指标主题浏览、SQL 校验与执行、指标主题查询）由服务端白名单注册，远端服务负责语义校验与只读执行，最多返回 1000 行；不提供自然语言转 SQL 的服务端能力，不开放写操作，访客可见处不出现数据来源站点与技术词。

## 配置

本地服务端在 `apps/web/.env.local` 配置 `ZHIPU_API_KEY`。`ZHIPU_MODEL` 默认 `glm-5.3-flash`，`ZHIPU_BASE_URL` 默认 `https://open.bigmodel.cn/api/coding/paas/v4`，默认值以 [pi-chat.ts](../../../apps/web/lib/pi-chat.ts) 为准。密钥仅由服务端读取，本地密钥文件保持 Git 忽略与600权限；部署环境通过服务端环境变量配置。部署与远端变量是否已就绪需单独核验，不由历史记录推定。

智能问数另需 `ANALYTICS_MCP_URL`（默认远端数据服务地址，以 [analytics-mcp.ts](../../../apps/web/lib/analytics-mcp.ts) 为准）与 `ANALYTICS_MCP_TOKEN`（Bearer 令牌）。令牌仅服务端读取；缺失时智能问数工具返回不可用提示，不影响其他智能体。

## 实现入口

- 聊天外壳与消息：[ai-chat.tsx](../../../apps/web/components/ai-chat.tsx)、[conversation.tsx](../../../apps/web/components/ai-chat/conversation.tsx)、[ai-chat-ui.tsx](../../../apps/web/components/ai-chat-ui.tsx)。
- 本机存储：[use-saved-chat.ts](../../../apps/web/components/ai-chat/use-saved-chat.ts) 读取、校验并初始化v2记录，[chat-stream.ts](../../../apps/web/lib/chat-stream.ts) 合并写入与刷新快照。
- 流式接收：[use-pi-chat.ts](../../../apps/web/lib/use-pi-chat.ts)、[chat-stream.ts](../../../apps/web/lib/chat-stream.ts)；服务端：[API 路由](../../../apps/web/src/routes/api/ai-chat.ts)、[pi-chat.ts](../../../apps/web/lib/pi-chat.ts)。
- 会话模型与内置案例：[包 API](../../../packages/ai-chat/src/index.ts)；移动组件：[ai-chat-mobile-library.tsx](../../../apps/web/components/ai-chat-mobile-library.tsx)；首页：[ai-chat-preview.tsx](../../../apps/web/components/ai-chat-preview.tsx)。
- 智能问数工具桥接：[analytics-mcp.ts](../../../apps/web/lib/analytics-mcp.ts)、[analytics-tools.ts](../../../apps/web/lib/analytics-tools.ts)；协议与步骤状态检查：`pnpm check:chat`，准备、结果与覆盖边界见[聊天隔离环境](README.md#聊天隔离环境)。

## 阅读、提交与首页预览契约

底部阅读动效：输入面板按最新消息位置控制，离开底部阈值80px即以180ms向下淡出；中途无论滚动方向如何都保持隐藏，滚回最新消息或点击回到最新才显示。面板绝对定位，ResizeObserver同步消息末尾留白，隐藏不改变视口高度。回到最新按钮独立可用，草稿不卸载，隐藏时inert/aria-hidden，键盘和减少动态效果即时完成。顶部栏保留既有方向判断；两者只共享动效风格，不共享显示条件。

历史消息锁定：`GeneratedAnswer.readOnly`由消息位置与busy状态决定；最新已完成assistant回答可编辑，历史内容只读。编辑控件边界禁用，Native EditableTable字段锁定但details保持可展开；操作卡片去掉action，生成动作与历史onStateUpdate禁止回传。Table／Tabs／Accordion／复制保留查看交互。

参考 [OpenUI Interactivity](https://www.openui.com/docs/openui-lang/interactivity) 的 `humanFriendlyMessage`／`formState` 分离及官方聊天组件的折叠展示方式。用户气泡只显示操作描述；原生 details 默认收起，展开为只读提交记录，沿用13px正文／12px标签与44px展开目标。提交状态先进行JSON快照与边界校验，再保存、发送；不把字段清单拼进可见消息文本。SDK回传的是实际状态快照，未注册的未修改默认值仍由前一条生成回答提供，不从DOM猜测补齐。

生成库与 ThemeProvider 均从 `@openuidev/react-ui` 主入口导入，避免分包内的独立 ThemeContext 导致图表回退默认配色。

`AiChatPreview` 用8秒循环展示“提问→等待→卡片→完成率图表→追问入口”，数据来自内置试用样本（60%／90%）。仅使用 transform／opacity 动效；可见且前台时播放，离屏与后台暂停，键盘及减少动态效果展示完整静态结果。没有模型请求或嵌套控件，整块预览沿用作品原生链接。

## 当前验收

启动生产预览、假模型隔离配置、API检查和浏览器调用方式以 [当前验收索引](README.md) 为唯一操作入口；开发与生产预览均通过仓库根目录的 portless 命令启动。按实际改动选择生命周期、流式更新、持久化、表单和界面检查；真实模型请求与假模型检查分别记录。

历史82项源码审查、10组目录回放或下方旧脚本结果不代表当前完整组件覆盖。旧案例、移动控件、动作层级、输入值、只读与提交专项的场景尚需按验收索引适配当前契约，或使用 Playwright、CDP 等可用工具逐项核验；现有生命周期检查不能替代这些完整组合。iOS真机键盘、全部数据边界、媒体失败、混合组件流状态和逐帧视觉连续性仍须按实际证据报告，不写为全部通过。

## 历史记录（2026-10-04 整理，非当前执行入口）

见 [历史记录（2026-10-04 整理，非当前执行入口）](ai-chat-history.md#历史记录2026-10-04-整理非当前执行入口)。

### 历史环境记录（执行日期未单独记录）

见 [历史环境记录（执行日期未单独记录）](ai-chat-history.md#历史环境记录执行日期未单独记录)。

### 历史业务流程、移动交互与字号结果

见 [历史业务流程、移动交互与字号结果](ai-chat-history.md#历史业务流程移动交互与字号结果)。

### 历史通用组件压力回放

见 [历史通用组件压力回放](ai-chat-history.md#历史通用组件压力回放)。

### 历史首页预览、输入与阅读交互

见 [历史首页预览、输入与阅读交互](ai-chat-history.md#历史首页预览输入与阅读交互)。

### 历史表单提交与上下文结果

见 [历史表单提交与上下文结果](ai-chat-history.md#历史表单提交与上下文结果)。

<a id="通用组件压力回放"></a>

### 通用组件压力回放

旧链接兼容入口，见 [历史通用组件压力回放](ai-chat-history.md#历史通用组件压力回放)；当前准备与覆盖边界见 [验收索引](README.md)。
