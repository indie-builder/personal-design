# 全站设计交付证据

2026-09-05。依据 OpenDesign 原始规则完成全站实现；用户产品事实和数据包保持。原文快照位于 `../open-design/source/`，25份文件哈希无变化。

## 验收索引

| 范围 | 实现与状态报告 | 可复现检查 |
| --- | --- | --- |
| 基础控件、主题、导航、重排 | [foundation.md](foundation.md) | `node scripts/verify-design.mjs`；[17项生产断言](evidence/foundation.json) |
| 首页时间轴翻页步长、方向键、拖动、减少动态效果、窄屏（封面失败为冒烟） | [home.md](home.md) | `node scripts/design-checks/home.mjs`；[结果](evidence/home-behavior.json) |
| 灵感检索、URL/返回、媒体轮播、超时恢复 | [muse.md](muse.md) | `node scripts/design-checks/muse-behavior.mjs` 与 `muse-recovery.mjs` |
| 布局书架与画册：翻页步长、页码目录、放大即详情、缺图、高清降级、旧链接与 404 | [layouts.md](layouts.md) | `node scripts/design-checks/layouts-check.mjs` 与 `layouts-states.mjs`；[列表](evidence/layouts-check.json)、[状态](evidence/layouts-states.json) |
| 灯箱滚动锁/焦点/组内翻图、自动播放、404 | [shared.md](shared.md) | `node scripts/design-checks/shared-browser.cjs` 与 `shared-autoplay.cjs` |
| 两条从首页出发的完整浏览路径 | [生产结果](evidence/journeys.json) | `node scripts/design-checks/journeys.mjs` |
| 个人网站宣传片播放/键盘控制/失败重试/外链 | —（实现见 site-showcase-media.tsx） | `node scripts/design-checks/personal-sites.mjs` |
| 动效策略：预览续播、监听器清理、翻页中断、键盘视频策略 | [验收记录](evidence/motion-policy.md) | `DESIGN_BASE_URL=http://localhost:3002 sh scripts/design-checks/motion-policy.sh`（ego-browser） |
| 全项目动效审查修复：混合媒体轮播、同帧返回、灯箱/头像中断、词典按需绘制、聊天输入布局 | [修复与验收](evidence/motion-audit-fixes.md) | `muse-motion.sh`、`lightbox-avatar-motion.sh`、`dictionary-motion.sh`、`ai-chat-scroll.sh`（ego-browser，支持复用空间） |
| 全量静态路由 | [路由结果](evidence/routes.json) | `node scripts/verify-design-routes.mjs` |
| 对外 portfolio API 契约：公共投影不泄露内部字段、分页/搜索与 400/404 错误语义 | —（测试即规格） | `pnpm test:portfolio-api`（需运行中的生产服务，随 `run-all.mjs` 全套执行） |
| 视觉与原规则独立复核 | [finish-review.md](finish-review.md) | ship；初轮发现与修复已关闭 |
| 来源完整性 | [source-integrity.json](evidence/source-integrity.json) | 25份来源快照哈希一致 |

`run-all.mjs` 所含旧 Playwright 脚本与 portfolio API 契约检查支持 `DESIGN_BASE_URL`，默认 `http://localhost:3000`。Agent 浏览器检查遵循根 AGENTS 的应用内 ego-browser 入口。生产预览执行 `pnpm build`、`pnpm --filter @personal-design/web start --port 3012`；`dictionary-search.sh`、`workspace-navigation.sh`、`back-motion.sh`、`back-stability.sh` 以及上表新增专项均支持 `DESIGN_BASE_URL`。三份导航专项支持 `EGO_TASK_SPACE`；词典搜索沿用 `EGO_SPACE_ID`。`global-ux.sh`、`search.sh` 仍写死 portless 开发域名 `https://personal-design.localhost`，需先 `pnpm dev` 再运行。ai-chat 系列按 [AI 问答](ai-chat.md)的隔离 origin 要求运行。

## 视觉证据与检查范围

截图索引：[captures.json](evidence/captures.json)。图片在仓库本机 `.impeccable/review/full-design/`，由 `node scripts/capture-design.mjs` 生成。首页、灵感列表、布局列表、两个详情模板、404分别覆盖1440×900、1024×768、390×844；另有5张暗色截图。媒体正常态等待实际图片加载，错误/超时态由行为脚本明确注入。

一轮集中检查和一轮确认完成；修正搜索占位符/边框对比度、首次主题事件竞争、首页/404主内容landmark、时间轴整数滚动导致终点前停滞。独立视觉复核无剩余实质问题。

最终 typecheck、全站 ESLint（零warning）、生产构建通过。构建510个静态条目：508个产品/内容页面、404与框架内部global-error。HTTP检查覆盖509个可访问条目（508个200与1个404）；框架内部global-error不当作用户路由。全部返回预期状态并具有主内容标记。全量路由检查不等于逐条内容的视觉检查；模板变体见各模块报告。

## 实际限制

- Chromium自动化覆盖桌面、模拟触摸及reduced-motion；未宣称真实iOS/Android设备或所有浏览器引擎验收。720px为1440px在200%下的等效CSS布局宽度重排检查，不冒充真实浏览器缩放操作。
- 外部高清图和视频依赖来源服务；已验证有界超时、重试/缩略图降级与原媒体入口，不保证第三方始终可用。8张上游缺图保持真实缺图状态。
- 数据中不存在的缺作者/空产品等分支以代码审阅覆盖，未修改数据制造成功证据。
- 既有未提交改动已保存执行基线，内容包未改动；本次未提交、推送或部署。

## 文字游乐场

五款文字小游戏的内置浏览器回归、复现方式与验证限制见 [文字游乐场](word-arcade.md)。

## 技术栈升级与定向优化

2026-10-04 升级 Next 16.3.8、Pi 1.0.2、pnpm 12.9.1、Lucide 1.52.0、Remotion 4.0.532 与 Node 24 类型；首页改为包内有界预览查询，聊天流式保存按500ms合并并在结束及离页时补写。类型、lint、格式、58项单测、生产构建、12项假模型聊天API、5项内容API和11条静态路由通过。当前会话没有内置浏览器，未声称交互或视觉通过；复现命令、单次取数测量和剩余间接依赖见 [本轮证据](evidence/stack-upgrade-2026-10-04.json)。

后续定向核查确认 AI SDK 是 OpenUI 未使用适配器的可选 peer。重新解析清除残留 `ai` 及9个专属依赖版本，冻结安装、58项单测、构建、12项聊天API、5项内容API、11条静态路由与官方流适配器集成检查通过；聊天引用JS字节数不变。见 [可选依赖清理证据](evidence/ai-optional-peer-2026-10-04.json)。

## 聊天流式更新与 Remotion 定向升级

2026-10-04：聊天首片段立即显示，后续按32ms窗口合并更新并在完成／错误／停止时补齐。Remotion版本限定覆盖minimist 1.2.8、semver 7.8.5、esbuild 0.28.2；64项单测、生产构建、12项聊天API、5项内容API与11条静态路由通过，真实1秒短片及海报渲染成功。原有 `remotion versions` 的Zod版本检查失败已在HEAD基线复现；未进行浏览器帧率和交互验收。复现命令、调度层测量及限制见 [验收证据](evidence/chat-stream-remotion-2026-10-04.json)。

## 首页等价性能优化

保持现有视觉、帧率与预取策略的计算／绘制／生命周期优化，见 [性能与等价性验证](home-performance.md)。

## Loop X 删除测试复扫

2026-10-04 基于 `d3c07ff` 的复扫移除首页无用布局预览数据、工具目录单调用透传层、无人使用的 Interface 字段与导出，并退役历史截图修补入口。工具页 JSX 与 CSS 逐项保持等价；保留共享导航、搜索、媒体、聊天及同步 Module 的实际职责。两次审查后的候选、保留理由、复现命令及限制见 [loopx-deletion-audit-2026-10-04.json](evidence/loopx-deletion-audit-2026-10-04.json)。

类型、lint、格式、38项单测、生产构建、11条静态路由和5项 portfolio API 均通过。当前会话未提供 Codex 内置浏览器，本轮未重跑交互及视觉验收；HTTP内容与源码等价检查不替代浏览器验收。

## 第二轮模块接口收缩

第二轮（2026-10-04）移除旧图鉴路由／post／zoom兼容链、无消费的详情动画标记与视觉模式、冗余产品字段和音效；灵感媒体直接提供 `previewSrc`，分类只统计一次；聊天使用 `text` 与唯一 `Conversation.memory`，每段对话共享一个主题 Provider。v2 存储独立初始化，旧 v1 记录不读取、不迁移、不覆盖。结果见 [module-depth-2026-10-04.json](evidence/module-depth-2026-10-04.json)。

全仓类型／lint／格式、38项现有测试、生产构建、11条静态路由、旧图鉴001／063／999的HTTP404、5项portfolio API与12项聊天API均通过。内置浏览器运行 `shallow-navigation.browser.mjs`、`current-layouts.browser.mjs`、`muse-errors.browser.mjs`、`chat-lifecycle.browser.mjs` 和 `current-site.browser.mjs`；各文件头部记录调用方式。多标签页验收时，viewport须作用于被测标签页，可用其CDP的 `Emulation.setDeviceMetricsOverride` / `Emulation.clearDeviceMetricsOverride` 实现传入的 `set` / `reset`。

全站基础检查显式记录一项未通过：390px深色词典的iframe在hydration后把自身 `data-theme` 改回light，宿主与 `__atlasTheme` 仍为dark。此现象已在本轮修改前的原工作区生产服务复现，词典生产代码未改；其余基础路径通过。结果中 `changedFlowsPassed` 与 `allSitePassed` 分开记录，不把此问题或逐帧动效标为已通过。

验收先执行 `pnpm build`、`pnpm start`，使用worktree启动日志中的独立URL。聊天测试使用现有假模型 `node scripts/design-checks/fixtures/ai-chat-provider.mjs`；以 `ZHIPU_API_KEY=test-only ZHIPU_BASE_URL=http://127.0.0.1:3907/v1 pnpm start` 启动测试预览，再用 `portless alias upgrade-check.personal-design <应用端口>` 注册隔离origin。Node检查设置 `NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem"` 与 `DESIGN_BASE_URL`；浏览器脚本从tab读取实际origin。结束后停止假模型与测试预览、移除alias并恢复正常 `pnpm start`。

## 第一轮浅模块清理

PR 基于主分支 `5b8a05f` 的隔离工作树重新通过全仓类型／lint／格式、40项单测和生产构建；下方浏览器及API证据来自清理时的原工作区，详见结果中的 `integrationRecheck`。

2026-10-04 的[验收结果](evidence/shallow-modules-2026-10-04.json)记录类型／lint、36项单测、生产构建、361条静态路由、5项 portfolio API、9项 AI API，以及内置浏览器的筛选返回与聊天生命周期检查。`browse=1` 旧会话格式已退役，旧链接回退为普通详情导航；当前 `browse=2` 与按筛选保存的滚动／焦点记录继续使用。

对运行中的生产预览，在 Codex 内置浏览器 REPL 中将生产页绑定为 `tab`，从仓库绝对路径导入 `scripts/design-checks/shallow-navigation.browser.mjs`，执行 `verifyShallowNavigation(tab, await tab.capabilities.get('cdp'), await browser.capabilities.get('viewport'))`。脚本覆盖1440／1280／390／320px、双主题、键盘、减少动态效果、站内返回与原生后退；截图保存到 `.impeccable/review/shallow-modules/`。

聊天检查先按 [AI 问答](ai-chat.md)配置现有假模型与独立 `upgrade-check.personal-design.localhost` origin，再导入 `scripts/design-checks/chat-lifecycle.browser.mjs` 执行 `verifyChatLifecycle(tab, await tab.capabilities.get('cdp'))`；端口取当前 tab 的 origin。检查使用界面新建测试会话，不清空已有记录；请求中止观测结束即恢复。结束后停止假模型并恢复正常预览。

本轮没有运行会启动独立 Chromium 的 `run-all.mjs` 浏览器部分；上述可复跑脚本使用内置浏览器。静态截图不代表全站逐帧动效验收，假模型检查不代表真实模型结果。
