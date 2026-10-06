# 路由、灯箱、开册、循环与首页编舞动效回归

2026-10-06。第一轮补齐「路由／灯箱细粒度关键帧」与「开册性能实测」；第二轮（同日）补齐循环预览断言、时间轴漫步者、头像彩蛋与路由扩展场景（深滚动、原生后退、修饰键、限速追加），并核验登记既有 `layout-first-paint` 与 `muse-performance`。检查为可注入 `tab`／`cdp` 的导出模块，接口同[验收入口](README.md)；`pnpm check:browser` 内置 Playwright 适配层自动执行。

## 第一轮：路由、灯箱与开册

### 路由成对过渡（[route-motion.browser.mjs](../../../scripts/design-checks/route-motion.browser.mjs)）

灵感集网格与详情间逐帧采样 `#workspace-content` 的 WAAPI 动画（`getAnimations` 读取时长与关键帧）、URL、`[data-route-motion]` 与 travelTitle 计数。第一轮八项外，第二轮追加四组场景：

- 网格→详情（指针）：路由提交前原页有 180ms 退场（末帧 `translateX(-28px)`）；退场期间 URL 不变；详情以 360ms、起始 `translateX(28px)` 进入；结束后无 `data-route-motion`、travelTitle 或残留动画，真实标题可见且内容中心无透明阻挡层。
- 详情「下一件」／「上一件」：退场末帧分别为 `-28px`／`+28px`，目标页按行进方向自右／自左 360ms 进入；退场先于 URL 切换。
- 详情返回网格：默认 180ms 退场后提交返回；网格 360ms 重入；共享标题飞行层出现并清理；恢复浏览上下文分类（URL query）、滚动位置（±80px）与焦点（回到原单元格）。
- 键盘路径（Tab 至网格单元格后 Enter、详情方向键）：不创建任何空间动画或 travelTitle，路由即时切换。
- 快速反向：进入动画进行中立即返回，取消后无残留动画、错误路由或阻挡层。
- 减少动态效果（指针点击）：同键盘，即时且无动画痕迹。
- 深滚动网格→详情（多批追加后）：退场仍作用于原表面；返回恢复深滚动位置、已加载数量且卡片 id 无重复。
- 浏览器原生后退（popstate）：不产生任何表面动画，无 data-route-motion／travelTitle 残留，URL（含分类 query）、滚动与焦点恢复。
- 修饰键点击（mask 4）：不启动退场、当前页 URL 不变，导航放行为浏览器默认。
- 限速追加落定（`Network.emulateNetworkConditions` 1400ms）：追加未落定时进入详情，退场仍先于提交；放行后返回网格状态行回到 ready、卡片不重复不翻倍、sentinel 可再触发追加。

### 灯箱 FLIP 与滑动（[lightbox-motion.browser.mjs](../../../scripts/design-checks/lightbox-motion.browser.mjs)）

在含 ≥2 张图片的灵感详情页采样灯箱 `img` 的 computed transform／transition 与拖拽容器内联样式：

- 指针打开：首帧 transform 等于自触发元素 rect 出发的 FLIP 起点（矩阵平移／缩放与实测几何一致）；展开 transition 200ms，收尾 transform 为 none。
- 关闭：140ms 收拢过渡，终点为重测后的触发元素位置；dialog 卸载、body 滚动锁解除、焦点回到触发元素。
- 翻页后关闭（sourceEl 失效）：原地 `scale(0.97)` 淡出并卸载。
- 触摸拖拽：跟手 `translate3d`（约 dx×0.9）；超过阈值松手切页并复位 transform；未达阈值 150ms 回弹且不切页；鼠标拖拽不产生位移。
- 减少动态效果：打开 transition 被钳位至即时（≤0.01ms，站点刻意保留 transitionend）、无 FLIP 残留位移；回弹 inline transition 为 none；Esc 关闭与焦点回归做存在性断言（焦点细节已由 current-layouts 覆盖）。

### 开册序列性能（[book-opening-performance.mjs](../../../scripts/design-checks/book-opening-performance.mjs)）

`/products/layout-compositions` 指针点击书脊，从点击起用 rAF 采样帧间隔直至画册就绪（抽书 1680ms＋封面对齐 360ms＋翻开 720ms）：

- 序列在 4.5s 看门狗内完成并进入「1–2」跨页（页码状态行实际格式为 `1–2 / N`）。
- 无 >100ms 单帧；>50ms 长帧 ≤ 总帧数 5%。同时记录平均／95 分位帧时长、最大帧与掉帧率（>25ms 占比）。
- 键盘与减少动态效果直接进入目标跨页，不出现抽书或开册展示层；即时路径不做帧采样。

## 第二轮：循环预览、首页编舞与既有性能脚本核验

### 循环预览（[preview-loops.browser.mjs](../../../scripts/design-checks/preview-loops.browser.mjs)，`verifyPreviewLoops`）

书籍队列（6s 抽书周期）、小票预览（10s 五段周期，`data-ready`／`data-running` 双门）、AI 问答预览（8s 六段循环，`--preview-play-state` 驱动）各覆盖四态：

- 可视且指针模式：周期推进（书目更换／时钟前进／采样签名变化）；AI 问答预览断言关键帧仅动画 opacity/transform（经 `animationName` 反查 `CSSKeyframesRule` 收集属性——本 Chromium 的 `CSSAnimation.getKeyframes` 不可调用）。
- 离屏：暂停且时钟冻结，恢复后自原进度续播（书籍队列另断言离屏超整周期不凭零时长 animationend 跳下一本）。
- 键盘模式（可信 keydown 置 `data-input`）：静态完成态（小票显示完整小票、AI 问答露出完整结果）。
- 减少动态效果：动画归零、状态静止。
- 小票封面拦截（`Network.setBlockedURLs`，需先 `Network.enable`）：`data-ready=false` 且无周期动画挂载。

### 时间轴漫步者（[timeline-motion.browser.mjs](../../../scripts/design-checks/timeline-motion.browser.mjs)，`verifyTimelineMotion`）

单一 WAAPI 时钟契约：路线与揭示动画共享 `currentTime`（±150ms）；步态／朝向（`data-step`/`data-look`）与 date-bump（520ms，命中一次即清除）由 40ms tick 驱动；离屏（横向滚动裁剪 IO）暂停冻结、恢复续播不重播；快进收尾须先把精灵滚回视口（瞬移会落在 IO 裁剪外被暂停，onfinish 不触发）；完成后 `data-complete` 置位、隐藏且无运行动画；键盘与减少动态不启动路线。

### 头像彩蛋（[taichi-motion.browser.mjs](../../../scripts/design-checks/taichi-motion.browser.mjs)，`verifyTaichiMotion`）

指针点击触发 9.2s 序列：≥10 个动画共享时钟（关节 currentTime 离散 ≤100ms）、舞台 `pointer-events:none`、命中穿透到作品链接、触发器提示 Esc 并防重复。Esc 即时收起：**Esc 属键盘输入，外壳先置 `data-input=keyboard`，组件 `stop()` 走即时路径**——组件内 150ms 淡出分支实际不可达（记录为发现，非缺陷）。动作中切换即时策略 ~20ms 内收起；减少动态仅 1s 静态姿态淡变并自动收起。

### 既有性能脚本核验

- [layout-first-paint.mjs](../../../scripts/design-checks/layout-first-paint.mjs)（跨页 SSR 首屏）：按当前契约验证通过，已适配 `DESIGN_BASE_URL` 并纳入 `check:browser` 套件。
- [muse-performance.mjs](../../../scripts/design-checks/muse-performance.mjs)（SSR 窗口化、版本化媒体缓存、分片接口）：需版本化构建前置。**运维注记：`next start` 启动时会重新求值 next.config 的 `images.localPatterns`，启动环境必须携带与构建相同的 `MEDIA_VERSION`／`VERCEL_GIT_COMMIT_SHA`，否则版本化 URL 全部 400**（本轮实测发现；Vercel 两阶段环境一致，本地复现需 `MEDIA_VERSION=<sha> pnpm build && MEDIA_VERSION=<sha> pnpm start`）。验证通过，因前置条件不纳入默认套件。

## 复现

```sh
pnpm build
pnpm start # 使用启动日志中的 Portless URL
export DESIGN_BASE_URL=https://personal-design.localhost # worktree 改成实际 URL
export NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem"
pnpm check:browser # 三个检查已由 run-all.mjs 内置适配层自动执行
pnpm check:navigation # 核对登记与导出
```

手动注入运行：准备兼容 `tab`／`cdp`／`viewport` 适配器后调用 `verifyRouteMotion(tab, cdp, viewport)`、`verifyLightboxMotion(tab, cdp, viewport)`、`verifyBookOpeningPerformance(tab, cdp, viewport)`，返回 `{ passed, issues, checks, ... }`；性能检查的 `metrics` 含帧统计，必须检查 `passed`。检查登记于 [current-checks.json](../../../scripts/design-checks/current-checks.json)。

前置条件：生产预览就绪、本机 Chromium 可用（`pnpm exec playwright install chromium`）、灵感集存在多图条目与可翻页详情。断言基于真实 DOM／动画 API 与 URL，不使用像素截图。

## 结果

2026-10-06 记录运行（`pnpm build` + `pnpm start`，Portless URL `https://personal-design.localhost:1355`，无头 Chromium；第一轮 15 套件、第二轮 19 套件均全过 exit 0；第二轮构建为 `MEDIA_VERSION=<HEAD>` 版本化构建）：

- **路由成对过渡** PASS（21.5s，12 场景）：网格→详情 180ms 退场（末帧 -28px）先于路由提交、详情 360ms 自 +28px 进入；相邻导航方向帧就位；返回恢复滚动焦点；键盘（Tab+Enter、方向键）与减少动态零动画痕迹、即时到达；快速反向清理；深滚动（72 卡片、2831px）恢复无重复；原生后退零动画、URL/滚动/焦点恢复；修饰键放行默认行为；限速下追加落定无重复翻倍、sentinel 可再触发。
- **灯箱 FLIP 与滑动** PASS（20.0s）：3 图详情自动发现；FLIP 起点/终点几何比对、翻页后失效路径、触摸跟手与回弹、鼠标排除、减少动态钳位。
- **开册序列性能** PASS（4.8s）：序列 2892ms、平均 16.7ms/帧、p95 18ms、最长 20ms、零长帧零掉帧；键盘 19ms、减少动态 29ms 直接进入。补齐 DESIGN.md「需要实测性能」记录。
- **循环预览** PASS（41.0s，13 项）：书籍队列可视推进/离屏冻结续播/键盘停止/减少动态静止；小票周期推进/暂停/键盘完整小票/拦截后不挂载；AI 问答预览运行态仅 opacity/transform、离屏冻结、键盘与减少动态静态完成态。
- **时间轴漫步者** PASS（11.7s，5 组）：374 帧采样覆盖爬出/站立/张望/步态/上跳/date-bump（x→420px）；离屏冻结于 6283ms、恢复续播至 6833ms 无重播；28000ms 路线快进收尾置 data-complete 并隐藏；键盘与减少动态时钟冻结零命中。
- **头像彩蛋** PASS（6.7s，4 组）：10 个动画共享 9.2s 时钟、舞台不捕获输入且命中穿透；Esc 键盘路径即时收起；即时策略切换 20ms 收割；减少动态仅 1s 静态姿态淡变。
- **layout-first-paint** PASS：跨页两图 SSR 直出 eager 高优先级（纳入套件后随全量通过）。
- **muse-performance** PASS（版本化构建一次性验证）：SSR 首批 24 件、HTML 窗口化、版本化缓存 immutable、无版本地址不永久缓存、分片接口整批。

## 限制

- 帧采样在无头 Chromium 中进行，反映渲染主线程节奏，不等同真机 GPU 合成性能；阈值（无 >100ms 单帧、长帧 ≤5%）为回归守卫，不作为性能优化目标。
- 触摸手势经 CDP `Input.dispatchTouchEvent` 合成，验证指针处理与捕获逻辑，不冒充真机触摸验收。
- 真实读屏播报顺序（muse 状态行、彩蛋提示）与真机触摸仍需独立证据；标点淡变中切换输入偏好、限速下慢详情请求两小场景未断言（快进与快速反向已覆盖同类出口）。
- 时间轴完成态经快进验证（保留进度语义由离屏场景单独覆盖），未等待 28s 真实路线走完。
- 头像组件 `stop()` 内 150ms 淡出分支因外壳键盘分类先行而不可达，属记录性发现；若未来出现指针路径的中断入口需重新评估。
