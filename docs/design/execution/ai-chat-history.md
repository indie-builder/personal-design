# AI 问答历史结果

返回 [AI 问答现行运行契约](ai-chat.md) 或 [当前验收索引](README.md)。以下完整保留分阶段历史记录；旧命令和结果不作为当前执行入口或通过声明。

## 历史记录（2026-10-04 整理，非当前执行入口）

以下保留原文中的分阶段结果；未写执行日期的条目不补造日期。其“本轮”“此前”“最新”仅指各次原记录，字号等旧数值不覆盖上方现行契约。此前浏览器工具限制已撤销。这些记录对应的 legacy ego-browser shell 驱动已于 2026-10 退役，历史记录见 git 历史。执行方式和覆盖缺口见 [验收索引](README.md)，其他升级证据见 [执行历史](history.md)。

### 历史环境记录（执行日期未单独记录）

`apps/web/.env.local` 使用 `ZHIPU_API_KEY`、`ZHIPU_MODEL=glm-5.3-flash`、`ZHIPU_BASE_URL=https://open.bigmodel.cn/api/coding/paas/v4`。本地文件权限600、被 Git 忽略；密钥仅服务端读取。Vercel `personal-design` 的 Production／Preview 已配置同名变量，key 为 Secret；当时记录称代码尚未部署到 Vercel。

### 历史业务流程、移动交互与字号结果


- `pnpm build`：同时生成官方组件提示词、检查类型并构建。
- 历史后端定向回归环境：当时先运行 `node scripts/design-checks/fixtures/ai-chat-provider.mjs`，再从根目录执行 `ZHIPU_API_KEY=test-only ZHIPU_BASE_URL=http://127.0.0.1:3907 pnpm start`。用 `portless alias upgrade-check.personal-design <启动日志中的应用端口>` 注册独立测试域名，将其完整 URL 设为 `DESIGN_BASE_URL`，设置 `NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem"` 后运行 `node scripts/design-checks/ai-chat-api.mjs`；覆盖流协议、上下文、摘要、一次结构修正、错误、中止和请求边界。结束后停止测试预览和夹具，移除测试 alias，再用 `pnpm start` 恢复正常预览。
- 结构引用回归：`node --test apps/web/lib/openui-content.test.mjs`。

既有业务流程验收：需求填入3人／5个项目／客户只读，推荐团队版，目标从80%调整到85%，效果分析保留85%目标并呈现三类图表，最终选择延长试用并生成行动摘要。表单状态被持久化，用户消息不含 OpenUI 技术指令。截图不能代替所有浏览器或真机键盘验收。

既有业务流程结果：生产构建、类型检查、定向 lint、27项单元测试通过；7项当前 API 回归通过；1440px与390px的6轮案例回放通过；最新真实模型冒烟检查通过。对应结果为 `evidence/ai-chat/api-result.json`、`evidence/ai-chat-case/result.json`、`evidence/ai-chat-live/result.json`。

移动端组件验收在独立 origin 验证320px浅色、390px深色和1440px中的手机框：至少44px按钮／选项行、日期与下拉、逐项编辑／撤销／确认、刷新持久化及横向溢出。日期使用真实键盘方向键确认，避免自动化填值绕过 React change。证据在 `evidence/ai-chat-mobile/`。

此前移动交互验收：上述三种视口及编辑回传通过，滑块触控区域至少44px；真实 GLM 生成计划包含原生日期与3个逐项编辑条目，使用“展开条目修改”说明，没有双击／单元格／右键等桌面引导，也无渲染错误。生产构建、类型检查、定向 lint 与27项现有测试通过。

此前整屏紧凑比例复验通过1440／817／390／320px检查，动作文字12px、输入16px、占位及辅助提示12px、触控高度至少44px，无页面横向溢出；浅深主题趋势与分布图实际 SVG 颜色断言通过。整屏消息与空态截图为本地 `.impeccable/review/ai-chat-visual/mobile-whole-chat.png`、`mobile-welcome.png`，尺寸数据为同目录 `measurements.json`。底部输入框实测58px（原70px）。最新生产构建、类型检查、定向 lint 与字体检测通过；移动交互脚本本轮通过日期、编辑、撤销、确认回传和刷新持久化。以上为浏览器模拟视口验收，未包含真机键盘测试。

### 历史通用组件压力回放

五组固定回答不含业务名称、不请求真实模型，覆盖长中英文／无断词长内容／长数值，1／2／5个动作及重复／破坏性primary，长选项／禁用OptionCard／必填错误，六列表与Table／LineChart／ImageGallery空数组，以及无操作的纯内容、代码和Accordion。320px浅色、390px深色、1440px浅色均无页面或回答容器横向溢出，无结构／渲染错误提示；每组primary不超过一个、破坏性primary为零，禁用卡片状态与必填校验检查通过。结果见 [result.json](evidence/ai-chat-contract/result.json)，15张截图在同目录，命名为`<宽度>-<主题>-<组索引>.png`。

动作排列的独立[结果](evidence/ai-chat-button-layout/result.json)覆盖1／2／3项操作：280px内容容器纵向，350／438px容器的两项等宽并排；单项满行，三项纵向。移动编辑回归已重跑。降级后的“另一个操作”真实点击后，mock请求中的最后用户文本严格等于原Action的“另一个”；actionPayloadPreserved断言已通过，未发起真实模型调用。

本轮尚未覆盖0值／缺失值／单点等全部数据边界、长列表所有数据完整性、媒体加载失败、混合组件流状态或iOS真机键盘。固定fixture通过不等于任意模型回答均通过，也不等于82项定义独立交互全部组合通过；逐项边界见 [通用状态矩阵](../controls/openui-mobile.md#通用状态验收矩阵)。

### 历史首页预览、输入与阅读交互

首页预览专项已通过8项检查，包含1440px／390px的三个关键帧、离屏暂停、后台可见性策略、减少动态效果、无模型请求与入口导航。构建及定向 lint 通过。结果见 `evidence/ai-chat-preview/result.json`；预览样式未改其他作品。

此前实际输入字号回归（占位仍12px时）在320浅色／390深色／1440浅色验证18个填写态控件，实际值与focus均13px、空select始终12px，原生日期子字段13px；并通过真实键入、刷新持久化、composer与创建表单13px、Modal内值13／占位12检查。结果见 `evidence/ai-chat-input-values/result.json`，截图保存同目录；该次不改组件密度，浏览器模拟视口不等于iOS真机键盘验收。

此前控件比例复验（满宽按钮修订前）：上述输入回归已按实际值／占位均13px更新并通过三视口各18个控件、聚焦、真实键入、刷新保存、创建表单与portal检查；整屏比例复验通过320／390／817／1440px、明暗图表及13px输入／按钮检查，全部10组目录回放和原生控件／编辑交互重跑通过。输入和选择保持44px操作区，标签／辅助说明保留12px，未恢复之前被撤回的整体压缩。

历史底部阅读专项曾验证位置条件、动画中间帧、草稿、视口、键盘返回和多行留白。

本次定向验收通过1440px／390px：离开最新位置隐藏、中途正反滚动不恢复、点击或滚回最新恢复、草稿保留、多行留白及键盘／减少动态效果。`evidence/ai-chat-scroll/*-motion.json`记录进入和退出中的实际opacity/transform帧，视口高度保持不变；结果见同目录 `result.json`。

历史只读回归当时使用 `EGO_TASK_SPACE` 与独立 localhost origin；目录与案例样例先显式设为最新消息，另行验证历史查看。

历史只读验收已通过390px浅色及1440px深色：历史字段禁用、最新字段可编辑；历史Tab／表格翻页和横滑／详情展开／复制入口保留，Slider键盘与合成触摸不能改值，锁定区域仍可触摸滚动。新问题发送后的等待期间也立即锁定此前回答，历史动作直接派发不会发请求；新回答可编辑，刷新保留已填写值及锁定状态。结果与截图见 `evidence/ai-chat-readonly/`；合成触摸基于Chromium，未代替iOS真机验收。

### 历史表单提交与上下文结果

390px浏览器模拟通过简短消息、默认折叠／展开、0与false、重新生成、继续追问、刷新后的状态保留；截图与结果在 [ai-chat-submission](evidence/ai-chat-submission/result.json)。`node scripts/design-checks/ai-chat-api.mjs` 在上述3907假模型／3107测试站下通过9项检查，包括结构化提交进入当前／历史请求及摘要输入、无效或超长提交返回400；未调用真实模型，不声称摘要无损保留所有字段。

本轮可编辑表格确认路径也通过320px浅色、390px深色与1440px手机框回归：实际编辑值进入submission上下文，未进入可见用户正文。生产构建、类型检查、定向lint、格式检查和27项现有单元测试通过。
