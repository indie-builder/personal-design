# 当前验收入口

本页维护当前可执行入口与覆盖边界。页面行为以[页面契约](../README.md)为准；以前的通过次数、截图和命令在[历史交付索引](history.md)，不能证明当前代码已通过。

## 准备生产预览

从仓库根目录执行 `pnpm build`，再执行 `pnpm start`。切换开发／生产模式前先停止当前服务；主工作区及 worktree 都使用启动日志给出的 Portless URL。将实际 URL 设为 `DESIGN_BASE_URL`，Node HTTP 检查另外设置 `NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem"`。

浏览器验收保持工具中立：可使用 Playwright、CDP 或当前环境可用的浏览器工具，按检查所需能力选择。现行检查登记在 [current-checks.json](../../../scripts/design-checks/current-checks.json)。`pnpm check:navigation` 核对现行文档链接、脚本路径及导出函数；自身的失败分支测试纳入 `pnpm test`，也可用 `pnpm test:navigation` 定向执行。CI 另检查技能库存、Web 与根脚本 lint、类型、格式和构建，并在构建后运行下述隔离聊天验收。

## 浏览器回归子集

生产预览就绪后，在另一个终端从仓库根目录执行：

```sh
export DESIGN_BASE_URL=https://personal-design.localhost # worktree 改成启动日志中的 URL
export NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem"
pnpm check:browser
```

`pnpm check:browser` 执行 [run-all.mjs](../../../scripts/design-checks/run-all.mjs)，依次运行已有的独立 Playwright 检查及配套 HTTP／portfolio API 检查，汇总结果，任一失败返回非零退出码。若本机缺少 Chromium，先执行 `pnpm exec playwright install chromium`。`DESIGN_BASE_URL` 可选择实际 Portless URL，默认 `https://personal-design.localhost`；应用始终通过根目录 `pnpm build`、`pnpm start` 提供生产预览。

套件包含基础设计、路由、首页、布局、灵感、共享媒体、浏览路径和个人网站检查，是现有浏览器回归子集，不代表全站完整覆盖。旧场景中的路由、选择器或断言如不符合现行契约，应记录失败并适配；不能以历史通过推定当前通过。聊天、词典详情、文字游戏及专项视觉检查按下方接口和页面契约另行执行。

## 终端 HTTP 与 API

```sh
export DESIGN_BASE_URL=https://personal-design.localhost # worktree 改成启动日志中的 URL
export NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem"
pnpm check:http --list
pnpm check:http
```

默认依次执行预渲染路由和 portfolio API，不启动浏览器，不调用模型。可用 `pnpm check:http routes` 或 `pnpm check:http portfolio` 定向执行；任一失败返回非零退出码，缺失脚本不是跳过成功。

| 范围 | 入口 | 前置与结果 |
| --- | --- | --- |
| 预渲染路由 HTTP 状态与 main 地标 | [verify-design-routes.mjs](../../../scripts/verify-design-routes.mjs) | 读取本次生产构建的 manifest；写入 `evidence/routes.json` |
| portfolio 公共投影、分页、搜索、错误语义 | [portfolio-api.test.mjs](../../../scripts/portfolio-api.test.mjs) | 生产服务；结果在终端，不代替浏览器交互 |
| 聊天流协议、摘要、错误、中止、输入边界 | [ai-chat-api.mjs](../../../scripts/design-checks/ai-chat-api.mjs) | 下述隔离假模型环境；显式运行 `pnpm check:http chat-api`，写入 `evidence/ai-chat/api-result.json` |
| 智能问数工具声明、tool_status 协议、工具前文本丢弃与降级 | [ai-chat-analytics-api.mjs](../../../scripts/design-checks/ai-chat-analytics-api.mjs) | 同上隔离假模型环境（未配置数据服务令牌）；显式运行 `pnpm check:http chat-analytics`，写入 `evidence/ai-chat/analytics-result.json` |

## 可选的 tab／CDP 适配接口

现有 `*.browser.mjs` 导出函数可复用已打开的生产页面，通过调用方注入兼容的 `tab`、`cdp` 与 `viewport`；这些模块本身不创建浏览器，终端直接 `node` 执行文件不会运行验收。可由当前浏览器工具提供接口，也可为 Playwright 编写适配层；没有可用浏览器能力时，完成可运行的静态与 HTTP 检查，并明确报告交互／视觉未验收。

`tab` 不是可直接替换为 Playwright `Page` 的接口。按模块需要包装异步 `url()`、`goto()`、`reload()`、`back()`、截图、`dev.logs()` 及 `tab.playwright` 定位器链；定位器 `waitFor({ state, timeoutMs })` 的 `timeoutMs` 要映射为 Playwright 的 `timeout`，`waitForLoadState({ state })` 要转换调用参数，`domSnapshot()` 需提供对应实现。CDP `send()` 的第三参数超时选项也需适配；直接赋值 `tab.playwright = page` 不足以保证兼容。只有 CDP 参数的函数可在满足所用命令与返回值协议后复用。

以下展示可选的注入接口，`tab` 和 `cdp` 由调用方先准备。例如 Playwright 可通过 `page.context().newCDPSession(page)` 获取 Chromium 标签页的 CDP session，再包装所需接口。尺寸变更使用**被测标签页**的 CDP，避免多标签页时改到其他页面：

```js
// tab：兼容适配器；cdp：同一标签页的 CDP 适配器，由调用方注入。
const viewport = {
  set: ({ width, height }) => cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  }),
  reset: () => cdp.send('Emulation.clearDeviceMetricsOverride'),
};
const { verifyCurrentSite } = await import('file:///ABSOLUTE_REPO/scripts/design-checks/current-site.browser.mjs');
const result = await verifyCurrentSite(tab, cdp, viewport);
console.log(result);
// 该检查可能返回问题列表而不抛错；必须检查 passed。
if (!result.passed) throw new Error(JSON.stringify(result.issues));
```

| 改动范围 | 模块与调用 | 覆盖及限制 |
| --- | --- | --- |
| 全站基础路径 | [current-site.browser.mjs](../../../scripts/design-checks/current-site.browser.mjs)：`verifyCurrentSite(tab, cdp, viewport)` | 多尺寸、主题、主要产品基础操作、退役路由；检查返回的 `passed` / `issues`，不是逐帧视觉审计 |
| 书架、画册、放大 | [current-layouts.browser.mjs](../../../scripts/design-checks/current-layouts.browser.mjs)：`verifyCurrentLayouts(tab, cdp, viewport)` | 当前书架／画册状态、页码、放大、旧链接与焦点 |
| 筛选与返回现场 | [shallow-navigation.browser.mjs](../../../scripts/design-checks/shallow-navigation.browser.mjs)：`verifyShallowNavigation(tab, cdp, viewport)` | 1440／1280／390／320px、键盘、减少动态效果、站内与原生返回；截图写入 `.impeccable/review/shallow-modules/` |
| 灵感加载故障 | [muse-errors.browser.mjs](../../../scripts/design-checks/muse-errors.browser.mjs)：`verifyMuseErrors(tab, cdp)` | 网络／HTTP／格式／空页故障、重试、筛选变化与继续追加 |
| 路由成对过渡 | [route-motion.browser.mjs](../../../scripts/design-checks/route-motion.browser.mjs)：`verifyRouteMotion(tab, cdp, viewport)` | 网格→详情／相邻导航／返回的退场先于提交、方向关键帧、键盘与减少动态即时、快速反向清理；断言与限制见[动效回归](motion-checks.md) |
| 灯箱 FLIP 与滑动 | [lightbox-motion.browser.mjs](../../../scripts/design-checks/lightbox-motion.browser.mjs)：`verifyLightboxMotion(tab, cdp, viewport)` | 打开／关闭 FLIP 关键帧、翻页后失效路径、触摸跟手与回弹、鼠标拖拽排除、减少动态即时 |
| 开册序列性能 | [book-opening-performance.mjs](../../../scripts/design-checks/book-opening-performance.mjs)：`verifyBookOpeningPerformance(tab, cdp, viewport)` | 抽书＋对齐＋翻开序列帧采样（长帧阈值）、键盘／减少动态即时路径；实测数字见[动效回归](motion-checks.md) |
| 聊天生命周期 | [chat-lifecycle.browser.mjs](../../../scripts/design-checks/chat-lifecycle.browser.mjs)：`verifyChatLifecycle(tab, cdp)` | 假模型隔离 origin；错误后继续、停止、离页中止、摘要、存储版本与图表主题 |
| 首页性能与预览 | [home-performance.browser.mjs](../../../scripts/design-checks/home-performance.browser.mjs)：`verifyTimelineBounds(cdp)`、`verifyDictionaryReuse(cdp)` | 时间轴边界；先使词典预览可见并等待 Canvas 就绪，再检查实例复用。`verifyPreviewPixels(cdp)` 另需[像素等价性夹具](home-performance.md#复现) |
| 五款文字游戏 | [word-arcade.browser.mjs](../../../scripts/design-checks/word-arcade.browser.mjs)：`verifyWordArcade(tab, cdp)` | 进入游戏页后运行；真实得分、暂停、重置；附加对齐／重开／中断函数的前置状态见文件注释及[记录](word-arcade.md) |
| 首页游戏预览 | [word-arcade-preview.browser.mjs](../../../scripts/design-checks/word-arcade-preview.browser.mjs)：`assertPreviewMotion(cdp, expected)` | 先用时间轴按钮露出预览；分别在可视、减少动态效果、键盘、离屏状态采样，不能一次调用代表全部状态 |

开发时选择相关项；交付时运行适用的全部当前项，并逐项记录缺少前置条件或未执行的项目。HTTP、行为、状态和视觉分别报告；返回值、异常和 screenshots 均按实际结果留存。

## 聊天隔离环境

从根目录执行：

```sh
pnpm build
pnpm exec playwright install chromium # 本机已有 Chromium 可跳过；Linux CI 加 --with-deps
pnpm check:chat
# 仅后端协议、摘要与降级检查，无需浏览器：
pnpm check:chat --http
```

[run-chat.mjs](../../../scripts/design-checks/run-chat.mjs) 自动创建独立 Portless 状态目录，分配代理端口和 HTTPS CA，再通过根目录 `pnpm start` 启动生产预览、注册 `upgrade-check.personal-design.localhost` alias。它覆盖继承的模型与数据服务地址和凭据：HTTP 阶段显式清空 `ANALYTICS_MCP_TOKEN`，执行 `chat-api` 与 `chat-analytics`；浏览器阶段使用 `test-only` 令牌连接[本地假 MCP](../../../scripts/design-checks/fixtures/analytics-mcp.mjs)和[假模型](../../../scripts/design-checks/fixtures/ai-chat-provider.mjs)，执行 [chat-analytics.mjs](../../../scripts/design-checks/chat-analytics.mjs)。后者在独立 Chromium context 中观察查询进度的运行／完成／失败、回答开始后收起，以及停止后恢复输入；不拦截响应流。夹具使用本机 3907／3908，端口被占用时保留现有进程并报错。

命令自动设置本轮 `DESIGN_BASE_URL`、`PORTFOLIO_API_BASE` 与 `NODE_EXTRA_CA_CERTS`，关闭 hosts 同步；Portless 0.15.7 启动预览仍检查系统信任，脚本仅在测试状态目录写 CA 指纹标记，让 Node 使用本轮 CA、Chromium 独立 context 接受测试证书，避免修改系统信任库。正常预览使用的代理与路由不参与本轮清理。命令阶段和就绪探测都有截止时间；成功、失败或 SIGINT／SIGTERM 后清理自己启动的进程组（包含 Portless 分离的应用组）和测试路由，清理完成前继续接收信号。被强制终止或主机退出时清理可能无法执行，按本轮日志核对进程。

结果、启动日志与步骤截图位于 `.impeccable/review/chat-checks/`，总结果为 `result.json`，浏览器结果为 `analytics-browser-result.json`；HTTP 结果另见上表证据路径。任一步失败返回非零退出码，先读同次日志定位。CI 上传顶层日志、JSON 和 PNG；Portless 状态目录含 CA 私钥，不上传或分享。

这是确定性协议与行为验收，真实模型和远端 MCP 的可用性、业务准确性仍需单独验证。若执行可选的 `verifyChatLifecycle(tab, cdp)`，应复用同样的隔离配置，在专用 origin 运行；它暂时替换 v1/v2 会话存储，并在 `finally` 恢复，浏览器或进程异常退出时可能无法恢复。

## 覆盖缺口与历史入口

[历史交付索引](history.md)及各日期报告保留旧命令和历史结果。复用时需核对脚本依赖、Portless 地址、测试 origin 和当前页面契约；脚本未登记或旧断言失效表示尚需核验或适配，不限制浏览器工具选择。

尚未按当前契约完整验证的覆盖：聊天完整六轮案例及官方组件压力／移动输入／只读／提交回放，真实模型端到端流程，灵感媒体性能与画册首屏服务端输出测量，以及头像彩蛋动效的关键帧。路由动效、灯箱 FLIP 与开册序列性能已由[动效回归](motion-checks.md)覆盖（2026-10-06）。可使用现有脚本、Playwright、CDP 或其他可用浏览器工具补齐，必要时适配旧场景。现有基础检查只覆盖其中部分行为；不能用其通过替代这些专项。性能检查的版本化媒体前置条件继续有效。

历史已知问题包括 390px 深色词典 iframe 曾恢复成浅色；见[当时记录](history.md#第二轮模块接口收缩)。重跑时如仍出现，应保留失败而不是引用历史通过。真实触摸设备和逐帧视觉连续性也需独立证据。
