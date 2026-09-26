# AI Coding 词典：内置浏览器 CDP 验收

运行 `pnpm build`，再启动 `pnpm --filter @personal-design/web exec next start -p 3102`。只使用 Codex 内置浏览器的 `cdp` capability；本记录不调用 ego-lite。

既有图谱验收证据：[JSON 记录](evidence/ai-coding-dictionary-cdp.json)。本文件以下为当前可重复步骤；新详情的最终 E2E 仍待记录，不能以旧 JSON 代替。原始文件快照在 `packages/ai-coding-dictionary/upstream/`，生成文件在 `apps/web/public/ai-coding-atlas/`（不提交生成副本）。图谱 JS/CSS 沿用快照，构建脚本处理资源地址、数据模块、loading 状态及本站桥接；按用户要求增强选中圆点／外圈／名称，并移除配色切换与音效入口。当前详情由 `bridge.js` 和 `detail.css` 实现，`prepare-runtime.mjs` 将原版 t8 详情组件替换为 null，分享和复制控件不再挂载。

## 重复步骤

1. 在内置浏览器打开 `/products/ai-coding-dictionary?term=harness`，读取该 tab 的 CDP 文档并取得 capability。
2. 使用 `Runtime.evaluate` 读取 `document.querySelector('iframe').contentWindow`；确认其 `__atlasJourney` 已就绪、`canvas` 存在、loading 元素不可见、外部 `a[href^="http"]` 数量为 0。
3. 确认 `.dictionary-detail` 标题是 Harness，`.dictionary-definition` 与 `.dictionary-definition-en` 各一份，`.dictionary-pair` 数量等于该词条英文正文段落数，每对含完整中文译文与英文原文。点击详情“下一词条”链接，确认词条及父页面 URL 都变为 `model-provider-request`；浏览器后退应回到 Harness。再做一次下一词条 → 浏览器后退，动画完成后仍应是 Harness 且仅一份阅读面。
4. 读取 `.dictionary-close` 按钮的 `getBoundingClientRect()`，用 `Input.dispatchMouseEvent` 执行按下／松开。随后点击原始 Search 按钮，用 `Input.insertText` 输入「缓存」。确认 `__atlasJourney.getState().matchSlugs` 为 `['prefix-cache']`，父页面 `q` 同步。
5. 从 `Page.captureScreenshot` 定位 Prefix cache 的圆点，使用 CDP 鼠标事件点击。确认镜头聚焦、阅读面打开且中英文各一份。
6. 清除搜索后，以 CDP 鼠标按下、移动超过 6px、松开执行拖拽，再发出 `mouseWheel`。检查前后画面发生变化，同时未误选词条。
7. 将视口设为 390×844，打开 `?term=token`。确认文档宽度为 390，底部阅读面高 68dvh，中英文完整可读，共享标题回退导航始终可见，标题与关闭不随正文滚动。最后清除临时视口覆盖和禁用缓存设置。
8. 查看控制台错误与 iframe 内 `performance.getEntriesByType('resource')`；确认运行资源均来自本机。
9. 直接打开 `?q=缓存`，确认输入内容、匹配词条与父页面 URL 均保留。
10. 在 Session 详情确认关联术语默认收起为一行；展开后按章节分组为紧凑目录。点击关联链接确认标题、完整双语内容与 URL 同步，正文回到顶部。检查修饰键新标签；从筛选结果外的关联词条跳转时，搜索清除且目标节点可见。
11. 在 Context 详情检查中英两份语义 table 的行列对应；点击内容定位只改变阅读面滚动位置；检查首末词条边界禁用，相邻名称完整换行。关闭与 Esc 均应清除选择并恢复搜索焦点，键盘与 reduced-motion 退出即时。
12. 在 1280px、815px 与 390px 宽度留存截图，确认原版详情、Share 和 Copy Markdown 控件 DOM 数量均为 0。截图及实际检查结果单独记录，不能由代码存在推定验收通过。

## 原始文件一致性

通过 CDP 的 `Runtime.evaluate` 在本地页面 fetch 上述 JSON 中列出的三个文件，恢复两种本地 URL 前缀后，使用 `crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))` 计算散列。CSS 应与 JSON 记录及 `upstream/` 原始文件相同。JSON 中的 renderer 散列是迁入时基线；当前 renderer 有选中状态、图谱可读性及移除旧详情组件等补丁，差异以 `prepare-runtime.mjs` 中的 `replaceOne` 列表为准，不再宣称它与原版逐字相同。

阅读面、双语桥接、返回作品入口属于本站适配，不纳入原始文件一致性比较。中文搜索通过数据模块补充检索词，继续使用原版的搜索和图谱重排代码。

## 选中状态与功能移除回归

打开 `?term=context`，点“下一词条”进入 Context window：选中圆点保留章节浅色，纸色间隔与粗外圈完整可见，不被前景节点挡住；名称突出。关闭详情后选中标识消失。配色与声音控件不存在；点击、搜索后音频资源请求仍为 0。检查 `sectionColorOn` 始终为 false。

## 放射布局回归

用户优先保留原版向四周散开的形态。`focus-spacing.js` 保持各节点相对选中点的原始投影角度，只在碰撞时沿该方向向外寻找空位，选中点固定。关联节点优先排布，圆点与可读名称都预留间距；背景圆点也参与避让，避免前景遮挡。取消上一版 24px 的硬上限。不限制节点落入固定矩形，不改变原版背景淡化参数。原版 tD/tF 共用位置供节点、连线、标签和点击命中使用；关闭详情后位移平滑归零，搜索重排期间不施加避让。

内置浏览器打开 Turn（815px 宽），对照调整前画面检查四向连线、相邻圆点和漂浮。点击左上方 Agent 圆点，确认 URL 与详情均变为 agent，再关闭详情确认回到总览。

## 视觉适配范围

用户当前要求完整中英逐段对照，原有中文概述不代替全文译文；移除分享和 Copy Markdown，关联术语默认收起，展开后保留章节分组的紧凑文字目录。全屏知识网、原版收起式搜索、节点放大 15%、章节浅色、径向避让和标签渲染继续保留。桌面阅读面宽 clamp(340px,34vw,520px)，800px 及以下为底部 68dvh 非模态阅读面；标题和关闭常驻，正文独立滚动，相邻导航显示完整名称。背景、前景和 Albert Sans 继续接入本站；无配色开关和音效。

字体由本站 Albert Sans WOFF2 生成到 public；图谱用的 `runtime/AlbertSans-Medium.ttf` 是同一变量字体在 weight=500 的静态版本（FontTools instantiateVariableFont，再将 flavor 设为 None 保存），无需线上字体请求。

## 节点名称遮挡回归

打开 `?term=session`，核对 Session、Context window、Tool result 等名称均完整显示在圆点上方。标签固定使用屏幕朝上的偏移，所有文本材质关闭 depthTest/depthWrite，绘制层级高于节点及选中圆环；选中名称优先。径向避让计算使用同一偏移，避免视觉位置与碰撞范围不一致。拖动旋转镜头后再次检查名称不被圆点截断，再点击图谱中的一个圆点核对详情与 URL。
