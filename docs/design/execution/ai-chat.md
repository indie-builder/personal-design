# AI 问答

第六个作品，入口 `/products/ai-chat`。以最新方案为准，不保留旧自定义组件协议的兼容渲染。

## 界面与会话

桌面为居中480px的移动演示框，上下16px留白。外层「← AI 问答」与其他作品同样式，宽屏独立定位，不挤压演示框；不足800px预留72px页头防止重叠，639px以下取消框线。Menu、居中智能体、Plus 保留，创建页和会话抽屉都限定在演示框内。

手机字号、触控尺寸、中性主题、Albert Sans、成对动效遵循 DESIGN.md。输入区在最新消息区域显示，离开底部即收起；“回到最新消息”按钮水平居中且独立可用；向上滑动阅读时内层工具栏以180ms位移／淡出收起，反向滚动恢复，消息区高度不变。自动跟随回复不隐藏工具栏；键盘和减少动态效果即时切换。

生成期间显示等待状态，结束后显示复制与重新生成图标。复制渲染后的内容，不复制 OpenUI Lang。智能体仅有名称和系统提示词；头像从15张男生素材随机分配。会话、智能体、摘要及表单状态保存于当前浏览器 `personal-design:ai-chat:v1`，没有账号或跨设备同步。主题入口、保存位置说明、免责声明均不展示。

## 运行链路

- 后端：`@earendil-works/pi-coding-agent` 0.87.1 的 `AgentSession`，`ModelRuntime` 连接智谱 Coding Plan。
- 每次请求用 `SessionManager.inMemory()` 恢复已验证的历史与摘要，只将最新用户输入送进 `session.prompt()`；结束或中止即 dispose。没有跨实例全局 Map，适合 Vercel 冷启动。
- 关闭主机文件／终端工具、扩展、技能及项目上下文发现；只做问答，不开放官方 coding 示例中的主机操作能力。
- Pi `text_delta` 桥接为 OpenAI NDJSON；前端 `usePiChat` 用官方 `openAIReadableStreamAdapter` 解析。AI SDK 已移除。
- 输入检查角色、字段长度、消息数量、512KB体积及 Origin。上游错误不透出密钥或原始异常。
- 超过16条或24000字符时，用 Pi `completeSimple` 合并早期摘要，保留最近6条原文。摘要最多1500字，新摘要经 `x-ai-memory` 响应头回传并保存到消息 metadata。摘要失败不丢弃原始会话。

参考：[OpenUI Pi Harness](https://www.openui.com/docs/agent/agent-runtimes/pi)、[OpenUI headless](https://www.openui.com/docs/api-reference/react-headless)。

## 官方生成式 UI

通用能力按 [OpenUI移动端组件契约](../controls/openui-mobile.md)维护：Renderer管样式、布局和安全交互，生成提示管组件选择与阅读建议，领域知识与默认案例管业务。通用提示不默认推荐方案或套用试点流程；无需填写或下一步的答案允许无Form／Button。表单4–6字段、表格2–4核心维度等均为分组建议，必须保留必要字段与完整数据。`Save Changes`回传采用“请根据我更新的内容继续”。

统一使用 `@openuidev/react-ui` 0.16.3 的 `openuiLibrary`，包含82个组件定义，由官方 `Renderer` 流式渲染。`apps/web/scripts/generate-openui-prompt.mjs` 在 dev/build 时从同一库生成服务端提示词与校验 schema，避免前后端定义漂移。

服务端结束前用官方 parser 检查缺失根节点、未解析引用、结构错误和未挂载的组件；需要时在同一 Pi 会话追加一次结构修正。错误仍未解决则提示重试。根 Stack 按 statementId 去除同一内容组件的重复引用，不按文字去重；不提供旧协议或纯文本双轨渲染。

表单交互通过官方 `onAction` 回传，表单值转为可读文字进入上下文；`onStateUpdate`／`initialState` 保存与恢复输入状态。只允许继续对话和控件本地交互，不执行 Query／Mutation／外部业务操作。移动端组件适配由 `ai-chat-mobile-library.tsx` 统一维护，保留官方 schema 与状态／校验接口：内容布局统一纵向、回答／portal／编辑动作组铺满容器，单个满行；两个短操作在内容容器宽于320px时等宽并排，容器不宽于320px或三个及以上操作则全部纵向满行，Select／DatePicker改为原生控件，EditableTable改为逐项展开、细线分隔的字段行；确认操作仍使用官方 onAction 回传。主题适配限定 `.ai-openui`，官方样式只在全局入口按 Tailwind 层顺序导入一次。`ai-chat.module.css` 的 `.page --chat-*` 集中定义正文13／标签12／说明12／标题15／指标18／输入13px、回答图标14px及44px控件下限，`ai-chat-ui.module.css` 通过 `answer-*` 别名继承；`ai-chat-ui-theme.ts` 将官方类型与全部图表 palette 映射至同一亮暗主题。Card去外框、选择行采用中性选中底色，只读表格保留单边界及内部横滑，指标采用紧凑标签／数值行。外壳与回答统一缩小一号：头像32px、全部外壳标题15px、消息／列表13px，输入区内边距6px 8px 6px 12px；回答组间距12px、字段／表格容器均10px圆角，回答动作及编辑确认／撤销共用13px文字、20px行盒、10px圆角和至少44px高度；消息操作图标继承14px。`--chat-input-size` 引用正文13px，统一文本／邮箱／密码／数字／URL／多行输入、已选下拉与非空选项、日期、滑块数值、编辑条目、composer、创建表单及portal字段；实际值、占位、空／已选下拉均13px，聚焦前后同号；标签和辅助说明仍12px。OpenUI及创建页字段行高20px、padding为8px 12px、最小高44px；生成TextArea最小80px，按内容自然增高。文字按钮width为100%、padding为10px 12px，网格间距8px；移除靠边小胶囊和用于缩小可见表面的透明边界。每组最多一个primary；渲染器的actionHierarchy将重复primary或破坏性primary降为secondary，动作顺序和payload不变。编辑确认用primary、撤销用描边default。聊天导航、发送和复制沿用图标形态，全站其他按钮规则不变。Tabs／Accordion／Chips控件文字13px；表格数据13px／表头12px、单元格padding为8px 12px。Radio／Checkbox行上下padding为6px，OptionCard为10px并自然增高，Switch行上下padding为2px。回答组间距12px、表单gap16px、既有240px图表和无220px上限的圆图保持不变。浏览器原生缩放继续可用，不添加禁缩放viewport；Menu／Plus形态、业务字段与流程、会话记录保持不变。

补充一致性规则：body portal／图表 tooltip 显式共享聊天尺寸；代码使用12px等宽字体与中性底、复制常显；列表／开关／InlineHeader／TextCallout辅助文字12px。Switch为44px真实触控按钮内绘28×18px轨道，OptionCard保留可见焦点，禁用／强调／highlight／sunk状态走项目主题。82项源码检查与目录回放的覆盖、结果和限制见 [一致性审查](ai-chat-consistency-audit.md)。

参考：[官方完整组件库](https://www.openui.com/docs/api-reference/react-ui)、[Renderer](https://www.openui.com/docs/openui-lang/renderer)。

## 移动端按钮依据与项目取舍

- [Apple Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)建议同组按钮用视觉样式表达主次，避免靠不同尺寸制造强调。本项目采用同组统一尺寸、最多一个primary；“每组一个”是项目约束。
- [Material Button](https://developer.android.com/develop/ui/compose/components/button)区分filled的高强调主操作、outlined的中强调次操作和text的低强调操作。本项目用填充确认与描边撤销表达层级，不靠缩小撤销按钮。
- [WCAG 2.1 SC 2.5.5](https://www.w3.org/WAI/WCAG21/Understanding/target-size)是AAA级目标尺寸要求，提出44×44 CSS px并列出例外；不是所有WCAG等级都强制44px。Apple的pt、Android的dp与Web的CSS px是不同平台单位，不能当作同一测量单位互换。

本项目保留13 CSS px文字及至少44 CSS px操作目标。单操作满宽、宽于320px的内容容器容纳两个等宽短操作、窄容器或三个以上操作纵向排列，是针对手机聊天和窄框阅读的设计判断，不是上述官方规范要求所有按钮满宽的通用规定。导航、发送、复制仍保留图标操作；布局调整不改变动作语义或顺序。本轮验证完成前不据这些依据宣称验收通过。

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

## 配置

`apps/web/.env.local` 使用 `ZHIPU_API_KEY`、`ZHIPU_MODEL=glm-5.3-flash`、`ZHIPU_BASE_URL=https://open.bigmodel.cn/api/coding/paas/v4`。本地文件权限600、被 Git 忽略；密钥仅服务端读取。Vercel `personal-design` 的 Production／Preview 已配置同名变量，key 为 Secret；当前代码尚未部署到 Vercel。

## 验收与复现

- `pnpm build`：同时生成官方组件提示词、检查类型并构建。
- 真实模型：`sh scripts/design-checks/ai-chat-live.sh`，消耗真实模型额度，检查业务入口、图表切换、决策追问和刷新。
- 完整案例 UI 回放：`DESIGN_BASE_URL=http://localhost:<本地预览端口> sh scripts/design-checks/ai-chat-case.sh`。仅在独立 localhost origin 导入真实模型生成的6轮案例，覆盖输入／目标恢复、表格、三类图表、决策结果及桌面／手机溢出；不改用户日常会话。证据在 `evidence/ai-chat-case/`。
- 后端定向回归：先运行 `node scripts/design-checks/fixtures/ai-chat-provider.mjs`，再以 `ZHIPU_API_KEY=test-only ZHIPU_BASE_URL=http://127.0.0.1:3907 pnpm --filter @personal-design/web exec next start -p 3107` 启动测试站，运行 `sh scripts/design-checks/ai-chat.sh`；覆盖流协议、上下文、摘要、一次结构修正、错误、中止和请求边界。
- 结构引用回归：`node --test apps/web/lib/openui-content.test.mjs`。

既有业务流程验收：需求填入3人／5个项目／客户只读，推荐团队版，目标从80%调整到85%，效果分析保留85%目标并呈现三类图表，最终选择延长试用并生成行动摘要。表单状态被持久化，用户消息不含 OpenUI 技术指令。截图不能代替所有浏览器或真机键盘验收。

既有业务流程结果：生产构建、类型检查、定向 lint、27项单元测试通过；7项当前 API 回归通过；1440px与390px的6轮案例回放通过；最新真实模型冒烟检查通过。对应结果为 `evidence/ai-chat/api-result.json`、`evidence/ai-chat-case/result.json`、`evidence/ai-chat-live/result.json`。

移动端组件验收：`EGO_TASK_SPACE=<active> DESIGN_BASE_URL=http://localhost:<端口> sh scripts/design-checks/ai-chat-mobile.sh`，在独立 origin 验证320px浅色、390px深色和1440px中的手机框：至少44px按钮／选项行、日期与下拉、逐项编辑／撤销／确认、刷新持久化及横向溢出。日期使用真实键盘方向键确认，避免自动化填值绕过 React change。证据在 `evidence/ai-chat-mobile/`。

此前移动交互验收：上述三种视口及编辑回传通过，滑块触控区域至少44px；真实 GLM 生成计划包含原生日期与3个逐项编辑条目，使用“展开条目修改”说明，没有双击／单元格／右键等桌面引导，也无渲染错误。生产构建、类型检查、定向 lint 与27项现有测试通过。

此前整屏紧凑比例复验：`EGO_TASK_SPACE=<active> DESIGN_BASE_URL=http://localhost:<端口> sh scripts/design-checks/ai-chat-visual.sh` 通过1440／817／390／320px检查，动作文字12px、输入16px、占位及辅助提示12px、触控高度至少44px，无页面横向溢出；浅深主题趋势与分布图实际 SVG 颜色断言通过。整屏消息与空态截图为本地 `.impeccable/review/ai-chat-visual/mobile-whole-chat.png`、`mobile-welcome.png`，尺寸数据为同目录 `measurements.json`。底部输入框实测58px（原70px）。最新生产构建、类型检查、定向 lint 与字体检测通过；移动交互脚本本轮通过日期、编辑、撤销、确认回传和刷新持久化。以上为浏览器模拟视口验收，未包含真机键盘测试。

生成库与 ThemeProvider 均从 `@openuidev/react-ui` 主入口导入，避免分包内的独立 ThemeContext 导致图表回退默认配色。

## 通用组件压力回放

在独立localhost测试站运行：

```sh
EGO_TASK_SPACE=<active> DESIGN_BASE_URL=http://localhost:<端口> sh scripts/design-checks/ai-chat-contract.sh
```

五组固定回答不含业务名称、不请求真实模型，覆盖长中英文／无断词长内容／长数值，1／2／5个动作及重复／破坏性primary，长选项／禁用OptionCard／必填错误，六列表与Table／LineChart／ImageGallery空数组，以及无操作的纯内容、代码和Accordion。320px浅色、390px深色、1440px浅色均无页面或回答容器横向溢出，无结构／渲染错误提示；每组primary不超过一个、破坏性primary为零，禁用卡片状态与必填校验检查通过。结果见 [result.json](evidence/ai-chat-contract/result.json)，15张截图在同目录，命名为`<宽度>-<主题>-<组索引>.png`。

`ai-chat-button-layout.sh`的独立[结果](evidence/ai-chat-button-layout/result.json)覆盖1／2／3项操作：280px内容容器纵向，350／438px容器的两项等宽并排；单项满行，三项纵向。移动编辑回归已重跑。降级后的“另一个操作”真实点击后，mock请求中的最后用户文本严格等于原Action的“另一个”；actionPayloadPreserved断言已通过，未发起真实模型调用。

本轮尚未覆盖0值／缺失值／单点等全部数据边界、长列表所有数据完整性、媒体加载失败、混合组件流状态或iOS真机键盘。固定fixture通过不等于任意模型回答均通过，也不等于82项定义独立交互全部组合通过；逐项边界见 [通用状态矩阵](../controls/openui-mobile.md#通用状态验收矩阵)。

## 首页预览

`AiChatPreview` 用8秒循环展示“提问→等待→卡片→完成率图表→追问入口”，数据来自内置试用样本（60%／90%）。仅使用 transform／opacity 动效；可见且前台时播放，离屏与后台暂停，键盘及减少动态效果展示完整静态结果。没有模型请求或嵌套控件，整块预览沿用作品原生链接。

`sh scripts/design-checks/ai-chat-preview.sh` 已通过8项检查，包含1440px／390px的三个关键帧、离屏暂停、后台可见性策略、减少动态效果、无模型请求与入口导航。构建及定向 lint 通过。结果见 `evidence/ai-chat-preview/result.json`；预览样式未改其他作品。

此前实际输入字号回归（占位仍12px时）：`EGO_TASK_SPACE=<active> DESIGN_BASE_URL=http://localhost:<端口> sh scripts/design-checks/ai-chat-input-values.sh` 在320浅色／390深色／1440浅色验证18个填写态控件，实际值与focus均13px、空select始终12px，原生日期子字段13px；并通过真实键入、刷新持久化、composer与创建表单13px、Modal内值13／占位12检查。结果见 `evidence/ai-chat-input-values/result.json`，截图保存同目录；该次不改组件密度，浏览器模拟视口不等于iOS真机键盘验收。

此前控件比例复验（满宽按钮修订前）：上述输入脚本已按实际值／占位均13px更新并通过三视口各18个控件、聚焦、真实键入、刷新保存、创建表单与portal检查；`ai-chat-visual.sh` 通过320／390／817／1440px、明暗图表及13px输入／按钮检查，`ai-chat-catalog.sh` 全部10组回放和 `ai-chat-mobile.sh` 原生控件／编辑交互重跑通过。输入和选择保持44px操作区，标签／辅助说明保留12px，未恢复之前被撤回的整体压缩。

底部阅读动效：输入面板按最新消息位置控制，离开底部阈值80px即以180ms向下淡出；中途无论滚动方向如何都保持隐藏，滚回最新消息或点击回到最新才显示。面板绝对定位，ResizeObserver同步消息末尾留白，隐藏不改变视口高度。回到最新按钮独立可用，草稿不卸载，隐藏时inert/aria-hidden，键盘和减少动态效果即时完成。顶部栏保留既有方向判断；两者只共享动效风格，不共享显示条件。`ai-chat-scroll.sh`验证位置条件、动画中间帧、草稿、视口、键盘返回和多行留白。

本次定向验收通过1440px／390px：离开最新位置隐藏、中途正反滚动不恢复、点击或滚回最新恢复、草稿保留、多行留白及键盘／减少动态效果。`evidence/ai-chat-scroll/*-motion.json`记录进入和退出中的实际opacity/transform帧，视口高度保持不变；结果见同目录 `result.json`。
