# 路由、灯箱与开册动效回归

2026-10-06。补齐[验收入口](README.md)覆盖缺口中「灯箱、头像和路由动效的细粒度关键帧」与「画册首帧测量」三项（头像彩蛋不在本轮）。三个检查为可注入 `tab`／`cdp` 的导出模块，接口与调用边界同[验收入口](README.md)；`pnpm check:browser` 已内置 Playwright 适配层自动执行，也可按既有接口手动注入运行。

## 范围与断言

### 路由成对过渡（[route-motion.browser.mjs](../../../scripts/design-checks/route-motion.browser.mjs)）

灵感集网格与详情间逐帧采样 `#workspace-content` 的 WAAPI 动画（`getAnimations` 读取时长与关键帧）、URL、`[data-route-motion]` 与 travelTitle 计数：

- 网格→详情（指针）：路由提交前原页有 180ms 退场（末帧 `translateX(-28px)`）；退场期间 URL 不变；详情以 360ms、起始 `translateX(28px)` 进入；结束后无 `data-route-motion`、travelTitle 或残留动画，真实标题可见且内容中心无透明阻挡层。
- 详情「下一件」／「上一件」：退场末帧分别为 `-28px`／`+28px`，目标页按行进方向自右／自左 360ms 进入；退场先于 URL 切换。
- 详情返回网格：默认 180ms 退场后提交返回；网格 360ms 重入；共享标题飞行层出现并清理；恢复浏览上下文分类（URL query）、滚动位置（±80px）与焦点（回到原单元格）。
- 键盘路径（Tab 至网格单元格后 Enter、详情方向键）：不创建任何空间动画或 travelTitle，路由即时切换。
- 快速反向：进入动画进行中立即返回，取消后无残留动画、错误路由或阻挡层。
- 减少动态效果（指针点击）：同键盘，即时且无动画痕迹。

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

2026-10-06 记录运行（`pnpm build` + `pnpm start`，Portless URL `https://personal-design.localhost:1355`，无头 Chromium，`pnpm check:browser` 全量 15 套件通过，exit 0；含评审修复后的开册滚动钉死与 runner 加固）：

- **路由成对过渡** PASS（10.7s）：网格→详情 180ms 退场（末帧 -28px）先于路由提交、详情 360ms 自 +28px 进入；下一件／上一件方向帧各就位；返回网格滚动与焦点恢复、键盘 Tab+Enter 与详情方向键零动画痕迹即时切换；快速反向取消后无残留；减少动态效果指针点击即时。
- **灯箱 FLIP 与滑动** PASS（19.5s）：自动发现 3 图详情；打开 FLIP 起点与触发元素几何一致、展开 200ms；关闭 140ms 回到重测位置并恢复焦点；翻页后关闭原地 scale(0.97) 淡出；触摸跟手、阈值切页、未达阈值 150ms 回弹不切页；鼠标拖拽零位移；减少动态即时开合。
- **开册序列性能** PASS（4.8s）：指针开册序列 2898ms 完成（守卫阈值 4500ms），采样 174 帧，平均 16.9ms、p95 17ms、最长 20ms，>50ms 长帧 0、>100ms 单帧 0、掉帧率 0；键盘 12ms、减少动态 13ms 直接进入跨页，无抽书或开册展示层。此前 DESIGN.md 开册宽高插值「需要实测性能」一项由此补上实测记录。

## 限制

- 帧采样在无头 Chromium 中进行，反映渲染主线程节奏，不等同真机 GPU 合成性能；阈值（无 >100ms 单帧、长帧 ≤5%）为回归守卫，不作为性能优化目标。
- 触摸手势经 CDP `Input.dispatchTouchEvent` 合成，验证指针处理与捕获逻辑，不冒充真机触摸验收。
- 头像彩蛋动效不在本轮范围。
- 独立评审（2026-10-06）指出、本轮未纳入断言的后续覆盖项：深滚动网格进入详情与浏览器原生后退／修饰键新标签；退场 hold 期间追加请求的成功／失败与返回恢复；muse 状态行真实读屏播报顺序；matchList 长距离滚动中 Esc／策略切换／后台的视口稳定性（滚动钉死机理已用页面内探针实证：首跳取消 smooth 未决帧、两帧后二跳钉死）；标点淡变中切输入偏好与小票预览恢复进度。
