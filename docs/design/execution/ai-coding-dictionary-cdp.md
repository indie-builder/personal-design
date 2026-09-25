# AI Coding 词典：内置浏览器 CDP 验收

运行 `pnpm build`，再启动 `pnpm --filter @personal-design/web exec next start -p 3102`。只使用 Codex 内置浏览器的 `cdp` capability；本记录不调用 ego-lite。

验收结果：[JSON 记录](evidence/ai-coding-dictionary-cdp.json)。原始文件快照在 `packages/ai-coding-dictionary/upstream/`，生成文件在 `apps/web/public/ai-coding-atlas/`（不提交生成副本）。图谱 JS/CSS 沿用快照，构建脚本处理资源地址、数据模块、loading 状态及本站桥接；按用户要求增强选中圆点／外圈／名称，并移除配色切换与音效入口。

## 重复步骤

1. 在内置浏览器打开 `/products/ai-coding-dictionary?term=harness`，读取该 tab 的 CDP 文档并取得 capability。
2. 使用 `Runtime.evaluate` 读取 `document.querySelector('iframe').contentWindow`；确认其 `__atlasJourney` 已就绪、`canvas` 存在、loading 元素不可见、外部 `a[href^="http"]` 数量为 0。
3. 确认原始详情标题是 Harness，并同时存在一条 `.atlas-chinese-definition` 和英文 `p[lang="en"]`。点击原始 Next 按钮，确认词条及父页面 URL 都变为 `model-provider-request`；浏览器后退应回到 Harness。再做一次 Next → 浏览器后退，动画完成后仍应是 Harness 且仅一份中文详情。
4. 读取原始 Close 按钮的 `getBoundingClientRect()`，用 `Input.dispatchMouseEvent` 执行按下／松开。随后点击原始 Search 按钮，用 `Input.insertText` 输入「缓存」。确认 `__atlasJourney.getState().matchSlugs` 为 `['prefix-cache']`，父页面 `q` 同步。
5. 从 `Page.captureScreenshot` 定位 Prefix cache 的圆点，使用 CDP 鼠标事件点击。确认镜头聚焦、原始详情打开且中英文各一份。
6. 清除搜索后，以 CDP 鼠标按下、移动超过 6px、松开执行拖拽，再发出 `mouseWheel`。检查前后画面发生变化，同时未误选词条。
7. 将视口设为 390×844，打开 `?term=token`。确认文档宽度为 390，原始移动端详情容器中有中英文。最后清除临时视口覆盖和禁用缓存设置。
8. 查看控制台错误与 iframe 内 `performance.getEntriesByType('resource')`；确认运行资源均来自本机。
9. 直接打开 `?q=缓存`，确认输入内容、匹配词条与父页面 URL 均保留。

## 原始文件一致性

通过 CDP 的 `Runtime.evaluate` 在本地页面 fetch 上述 JSON 中列出的三个文件，恢复两种本地 URL 前缀后，使用 `crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))` 计算散列。CSS 应与 JSON 记录及 `upstream/` 原始文件相同。JSON 中的 renderer 散列是迁入时基线；当前 renderer 有选中状态补丁，差异以 `prepare-runtime.mjs` 中的 `replaceOne` 列表为准，不再宣称它与原版逐字相同。

双语桥接、返回作品入口属于本站适配，不纳入原始文件一致性比较。中文搜索通过数据模块补充检索词，继续使用原版的搜索和图谱重排代码。

## 选中状态与功能移除回归

打开 `?term=context`，点 Next 进入 Context window：选中圆点为深色实心，纸色间隔与粗外圈完整可见，不被前景节点挡住；名称突出。关闭详情后选中标识消失。配色与声音控件不存在；点击、搜索后音频资源请求仍为 0。检查 `sectionColorOn` 始终为 false。

## 放射布局回归

用户优先保留原版向四周散开的形态。`focus-spacing.js` 保持各节点相对选中点的原始投影角度，只在碰撞时沿该方向向外寻找空位，选中点固定。关联节点优先排布，圆点与可读名称都预留间距；背景圆点也参与避让，避免前景遮挡。取消上一版 24px 的硬上限。不限制节点落入固定矩形，不改变原版背景淡化参数。原版 tD/tF 共用位置供节点、连线、标签和点击命中使用；关闭详情后位移平滑归零，搜索重排期间不施加避让。

内置浏览器打开 Turn（815px 宽），对照调整前画面检查四向连线、相邻圆点和漂浮。点击左上方 Agent 圆点，确认 URL 与详情均变为 agent，再关闭详情确认回到总览。
