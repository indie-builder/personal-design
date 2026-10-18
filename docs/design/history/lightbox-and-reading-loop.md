# 设计迭代：灯箱与阅读闭环阶段

本文件完整保留 2026-09-03 对应阶段的设计迭代记录，包含当时的审查、实现、验证和遗留。返回 [迭代日志索引](../../../.agents/design-log.md)；现行标准以 [DESIGN.md](../../../DESIGN.md) 与 [页面契约](../README.md) 为准，历史记录不覆盖用户后续决定。

## 第 3 轮（2026-09-03）—— 灯箱整体升级（含 RM P0 根治）

### 审查清单摘要（4 个 SubAgent 并行；3 个曾因配额中断，恢复后完成）

**P0（本轮必修）**
- RM 下灯箱永远无法关闭、透明遮罩锁死整页——第 2 轮 RM 补丁把 transition 置 none，而卸载唯一路径是 `onTransitionEnd`（用户故事 + 动效双维度实测实锤，属第 2 轮引入的回归）

**P1 共识（灯箱设计输入，4/4 命中）**
- 灯箱是死胡同：无关闭按钮（移动端无 Esc = 死局）、无图注、无详情入口、无左右切换
- layout 属性 FLIP（left/top/width/height）主线程重排；frame 用 window 快照、resize 不重算
- 遮罩 0.6 在暗房 neutral-950 上增量不足；灯箱打开期间 marquee 继续跑，关闭动画飞回旧位置
- 全图点击才开始加载，慢网 FLIP 空放；缓存图 onLoad 可能不触发
- 移动端 active tab 会滚出 tab 栏可视区（UX 新发现）
- IO 高亮只看当前批次：慢速滚动滞留/跳格、末端三个 tab 永远无法被位置感应点亮（动效代码分析 + UX 实测）
- 详情页 prev/next 首屏外 + 跨主题跳页；query/tab 状态不进 URL（→ 第 4 轮「详情页与浏览闭环」）

### 选题
**灯箱整体升级**（4/4「只能改一件事」均为灯箱或其子项），RM P0 列为验收项。捆绑：IO 高亮规则修正、active tab scrollIntoView。

### 方案与实现（`lightbox.tsx` 重写）
- **卸载双通道**：transitionend + 超时（DURATION+80ms）兜底；RM 下直接状态卸载——根治 P0，同时消除「动画被打断留残影」类边缘
- **transform 版 FLIP**：img 固定终态 frame，起始态 `translate + scale` 反算，全程合成层；frame 按源 rect 纵横比适配 88vw/78vh，resize 监听重算
- **关闭目标动态化**：关闭瞬间重新测量触发元素 `getBoundingClientRect()`（sourceEl 断开则回退初始 rect）；打开期间 `body[data-lightbox-open]` 暂停 marquee（CSS 联动），位置不再漂移
- **图注栏**：`编号 + 名称` + 「查看详情 →」直达 `[id]` 页（打通灯箱→详情→下载动线）；**显式 × 关闭按钮**（移动端常驻）；**同组左右切换**（内页 = 同二级主题有图条目，灵感墙 = 该行条目；支持 ←/→ 键）
- **加载策略**：thumb 打底播 FLIP，高清图 onLoad 后淡入；ref 回调补检 `img.complete`（修缓存图 onLoad 不触发的真实 bug，验证中抓到）
- **遮罩**：`neutral-950/70 + backdrop-blur-sm`，明暗背景通用；`ring-1 ring-white/10` 保暗房下边缘
- 焦点进 dialog（键盘不再漏给背后的时间轴）；Esc/←/→ 键盘支持
- `layout-gallery.tsx`：IO 高亮改「全节点可见率最高（并列取最左）」，threshold 多档，修滞留/末端偏格；active tab 变化时 `scrollIntoView(inline:nearest)`；条目点击携带 siblings 上下文
- `inspiration-wall.tsx`：同样接入 siblings + serial + href

### 验证
- typecheck / lint / build（354 页 SSG）全部通过
- ego-browser DOM 级实测：灯箱打开后 caption「001 三分法构图」、关闭/左右/详情链接齐全、`data-lightbox-open` 置位；「下一张」→ 002 黄金比例构图；× 关闭正常
- **RM 验收（CDP 模拟 prefers-reduced-motion）**：开 → Esc 关 → `elementFromPoint` 命中真实链接（P0 根治确认）
- 缓存高清图 opacity=1（ref 补检生效）
- 环境备注：隔离 tab rAF 节流导致截图常抓到 FLIP 中间帧，属自动化 artifact，真实前台 32ms 内双帧展开

### 遗留（下轮候选）
- **详情页与浏览闭环（第 4 轮首选）**：prev/next 上移到下载按钮下方 + 限定同二级主题（当前跨主题跳页）、同主题推荐条、主图限高一屏看全 + 点击进灯箱、query/activeCategory 同步 URL（返回原位/可分享）
- 搜索网格卡片也接灯箱（两视图心智一致）
- 内页条目行节奏与缩略图放大（移动端 56×74）
- 滚轮劫持残留（弱化后 P2，暂不加复杂度）
- 移动端撕角 HANDLE 96px 占比过大（P2）
- 全站强调色引入评估（P1，需谨慎）
- 内页时间轴/网格视图切换（33 个二级主题的直达入口）（P1）

---

## 第 4 轮（2026-09-03）—— 详情页与浏览闭环

### 审查清单摘要（4 个 SubAgent 并行）

**P0**
- 返回旅程全线失守：搜索词/tab/滚动位置全丢（query 纯组件 state；用户故事维度实测升级为 P0）
- 详情页 prev/next 跨主题跳页（catalog 线性相邻共 32 处跨主题边界）+ 桌面首屏外（y=939 > 828）

**P1 共识**
- 详情页：主图超一屏且不可放大、右栏 ~500px 空洞、零动效、键盘 ←/→ 缺失
- 搜索网格与时间轴点击行为不一致（网格整卡只能跳详情）
- 灯箱打磨：切条目「硬跳 + dip」需 crossfade、翻图无计数（3/15）、不预取相邻图、关闭动画 530ms 内按方向键会闪没（竞态）、翻多张后关闭飞回第一张位置、移动端箭头压图 17-30px

**P2**
- 001/350 硬编码、chips 语义混排、缺图占位双边框、暗房图注对比度、窄桌面 hint 错配

### 选题
**详情页与浏览闭环**（4/4 共识；用户故事建议 URL 状态与 prev/next 捆绑，正合本轮主题）。灯箱打磨包搭车（改动隔离在 lightbox.tsx）。

### 方案与实现
- **`[id]/page.tsx` 重排**：prev/next 限定同二级主题（组内相邻，跨主题 32 处边界消除）+ 上移到下载按钮下方（缩略图小卡片，首屏可达）；新增「同主题」推荐条（前后最近 6 张缩略图，填满右栏空洞）；主图 `lg:h-[calc(100dvh-12rem)]` + object-contain 一屏看全 + 点击进灯箱（`DetailMainImage`，siblings 同主题）；键盘 ←/→ 翻页（`DetailKeyboardNav`，新文件 `detail-tools.tsx`）；编号改 `catalog.length`；尺寸 chip 降格为纯文本；缺图占位去双边框；纯 CSS 入场 `detail-in`（server 兼容，页间导航重挂载即重播，RM 关闭）
- **URL 状态**（`layout-gallery.tsx`）：query/activeCategory ↔ `?q=&cat=`（router.replace 不产生历史）；初始 state 从 URL 读取 + cat 恢复时 scrollToNode 定位；useSearchParams 需要 Suspense 边界（page.tsx 已包）
- **搜索网格接灯箱**：图片区点击开灯箱（siblings = 本组有图条目），文字链接进详情——两种视图心智一致
- **灯箱打磨包**（`lightbox.tsx`）：切条目 crossfade（旧高清图保留到新图 onLoad 再淡出，消灭硬跳+dip）；图注加 `index+1 / total` 计数；展开后预取相邻两张高清图；关闭竞态修复（`go()` 清卸载倒计时 + 显式 `closingRef` 替代 `!expanded` 推断）；翻页后 sourceEl 置空（关闭原地微缩淡出而非飞回第一张）；移动端切换按钮并入图注栏（侧翼箭头 sm 起才显示，不再压图）；图注 text-shadow（暗房亮色卡片上可读）

### 验证
- typecheck / lint / build（354 页 SSG）全部通过
- ego-browser 实测（桌面）：/132 详情页 nav 只有「下一张 · 133 双栏版式」（同主题、navTop=312 首屏内）、推荐条 6 张、编号 132/350；主图灯箱 caption + 计数 1/8；tab 点击 → `?cat=07-chinese-composition`、搜索 → `&q=跨页`、进详情 → 返回 → URL/搜索词/9 条结果全部恢复；详情页 ArrowRight → /133
- 过程中修一处 lint 拦截：恢复 effect 里多余的 setState（初始 state 已读 URL），删除后通过

### 遗留（下轮候选）
- 时间轴滚动位置恢复（本轮只恢复了 q/cat，scrollLeft 恢复存 sessionStorage 可做）
- 灯箱 swipe 手势（移动端翻图）
- 内页条目行节奏与缩略图放大（移动端 56×74）
- 内页时间轴/网格视图切换（33 个二级主题直达）
- 滚轮劫持残留（P2，暂不加复杂度）
- 移动端撕角 HANDLE 96px 占比过大（P2）
- 窄桌面 hint 与 nativeScroll 状态对齐（P2）
- 全站强调色引入评估（P1，需谨慎）
- 灯箱：RM 下 crossfade 的 outgoing 清理即时化已做；切条目时 frame 不随条目纵横比重算（当前全站 3:4 统一，无忧）

---

## 第 5 轮（2026-09-03）—— 冲突修复 + 反馈与状态恢复打磨包

### 审查清单摘要（4 个 SubAgent 并行）

**主链路 verdict**：无 P0 级新问题（3/4 明确「主链路没有死路」，UI 维度「骨架可停手一轮、零强调色维持不加」）。「按主题翻图鉴」旅程桌面 8.5/10、移动 6.5/10。

**唯一功能性 bug（3/4 命中，动效定 P0）**
- 详情页打开灯箱后按 ←/→：灯箱翻图与 DetailKeyboardNav 跳页同时触发——第 4 轮两条新动线在同一个按键上互相拆台

**P1**
- 搜索结果深滚后返回，scrollTop 归零（q/cat 恢复了但位置没恢复，「记得一半比全丢更出戏」）
- 翻页后关闭灯箱：thumb 层 opacity 恒 0.99，「微缩淡出」只缩不淡、结尾硬切
- 全站没有任何 `:active` 按压反馈（触屏唯一即时反馈渠道缺失）
- detail-in 连翻时每页强制重播 0.5s，翻图鉴节奏被拖慢

**P2 一批**：推荐条缩略图无编号、sizes 过度声明 2.6 倍、搜索网格缺图双边框、移动端撕角 HANDLE 占 1/4 屏宽、窄桌面 hint 与 nativeScroll 脱钩、灯箱缺 swipe、nav 孤立分隔线（不会触发）

### 选题
**冲突修复 + 反馈与状态恢复打磨包**。无新 P0 可做，清掉冲突 bug 与「记得一半」的状态断点，补齐触屏反馈。

### 方案与实现
- **键盘冲突**：`DetailKeyboardNav` 回调开头守卫 `document.body.dataset.lightboxOpen === 'true'`（一行）
- **关闭淡出硬切**：thumb 层 opacity 改 `expanded ? 1 : hasOrigin ? 0.99 : 0`（无回飞目标时一并淡出）
- **搜索滚动位置**：sessionStorage 按关键词存 scrollTop（150ms 防抖），回到搜索视图时恢复
- **`:active` 按压反馈**：tab/chips/下载按钮/NavCard/推荐卡/灯箱全部按钮 `active:scale-[0.95-0.98]`，条目行 `active:bg-neutral-200`，`transition-colors` 相应改 `transition`
- **detail-in 翻页跳过**：详情→详情导航（NavCard/推荐条/键盘）sessionStorage 记目标路径，到达后 `html[data-detail-nav]` 禁用当页 detail-in。调试中连抓两个真实时序问题：导航过渡期旧树会跑 effect 提前消费标记（改记目标路径、到达才消费）+ StrictMode 双跑 effect 把刚设置的 dataset 删掉（consumed ref 守卫）
- **灯箱 swipe 翻图**：手写 pointer 手势（8px 激活、64px 或 0.5px/ms 触发、0.9 阻尼跟手、200ms 回弹），RM 保留手势去回弹动画
- **小项**：推荐条缩略图下加编号、sizes 改 `(min-width:1024px) 140px, 33vw`、搜索网格缺图占位 inset-3 装裱式、撕角 HANDLE 改 `min(96px, 22vw)`、nav 加 `prev || next` 条件、hint 媒体查询对齐 nativeScroll 判定 `(hover:hover) and (min-width:768px)`（首页+内页）

### 验证
- typecheck / lint / build（354 页 SSG）全部通过
- ego-browser 实测：灯箱打开按 → URL 不变 caption 翻图（冲突修复）；NavCard/键盘导航后 `data-detail-nav=true`（动画跳过）、直接进入详情 flag 为空（入场保留）；搜索「跨页」scrollTop 存取一致（298=maxScroll，clamp 正确）
- 过程中修两处自己引入的问题：swipe 起始行多余表达式（lint 拦截）、detail-nav 标记的两个时序 race（见上）

### 遗留（下轮候选）
- 灯箱 focus trap + 关闭后焦点还源（P2，~20 行）
- 33 个二级主题直达：节点列顶部 chips 列内锚点（UX 推荐的最小方案）或时间轴/网格视图切换
- `?q=&cat=` 组合链接清除搜索后 cat 语义丢失（P2，稀少场景）
- 时间轴 scrollLeft 精确恢复（UX 建议降级关闭：cat→scrollToNode 已覆盖节点粒度）
- 内页条目行缩略图移动端放大（UI 建议关闭：非必需）
- 全站强调色：UI 维度结论「维持不加」，若未来要加只考虑进度条与灯箱「查看详情」两处

---

## 第 6 轮（2026-09-03）—— 灯箱 Portal 根治 + 焦点/无障碍包

### 审查清单摘要（4 个 SubAgent 并行）

**P0（动效实测实锤，藏了两轮）**
- 详情页灯箱被 `detail-in` 的 transform fill 污染：fixed dialog 以主图容器为包含块——遮罩只有主图区域、图注栏被 overflow 裁掉不可见不可点、点击穿透命中背景。第 4 轮引入，历次 DOM 级验收（caption/计数/标记都对）发现不了 paint/hit-test 层的问题

**P1**
- 灯箱初始聚焦从未生效：dialog 渲染被 `active && frame` 门控，`[active]` effect 跑时 dialog 未挂载，focus() 静默落空——第 3 轮日志宣称的「焦点进 dialog」实际不成立（UX 实测 focusin 为空）
- 撕角关闭时灵感墙 48 个按钮占据 Tab 序头部（键盘旅程第一个接触点断链）
- swipe 回弹后 transition 残留：后续拖拽全程慢 200ms（首次拖拽是好的所以第 5 轮没抓到）

**P2**
- 时间轴条目行灯箱热区是 `a > span[onClick]`：键盘不可达，与搜索网格（button）能力不一致
- 按压反馈漏两处（首页产品卡、灵感墙卡片）；swipe 速度判定用全程平均读不到「末尾发力」；hover-preview 无 RM 处理（第 1 轮漏网清单最后一项）；搜索新词不清零滚动位置；节点列 webkit 滚动条粗糙；移动端「拉回来」hint 与 footer 过近

### 选题
**灯箱 Portal 根治 + 焦点/无障碍包 + swipe 残留**（P0+P1 集中修复）。二级主题 chips 直达（UI/UX 共同推荐的最后一个功能性断点）排第 7 轮。

### 方案与实现
- **Portal**：dialog `createPortal(…, document.body)`——根治 transformed 祖先污染，此后任何新入场动画都不会再伤灯箱
- **焦点三件套**：初始聚焦移到 `[active, frame]` effect（frame 就绪即 dialog 已挂载）聚焦关闭按钮；dialog 上 Tab/Shift+Tab 循环 trap；关闭后焦点还源到 `document.activeElement` 记录
- **inert 灵感墙**：back 层 `inert={!open}` + `aria-hidden`（React 19 原生属性），48 个不可见焦点停顿消除
- **swipe 残留**：onSwipeStart 清 transition，翻图分支也清；速度判定改指数平滑尾部速度（与 timeline 拖拽同口径）
- **条目行键盘可达**：`a > span[onClick]` 重构为「button（图，开灯箱）+ Link（文字，进详情）」并列结构
- **小项**：首页产品卡/灵感墙卡片补 `active:scale`；搜索新词显式 scrollTop=0；节点列 webkit 滚动条细条样式；hover-preview RM（lerp 吸附 + tilt 置 0）；移动端「拉回来」hint 隐藏（max-sm）

### 验证
- typecheck / lint / build（354 页 SSG）全部通过
- ego-browser **截图级验收**（吸取 P0 教训不再只查 DOM）：详情页灯箱全视口 1496×846、parent=body、图注可见、×按钮带焦点环（初始聚焦生效）（`/tmp/r6v-portal.png`）
- 焦点还源实测：Esc 后回到打开前的 activeElement（合成点击环境下为 BODY，行为正确）
- 过程中修一处 lint 拦截（swipe 改尾部速度后 event 参数未用）

### 遗留（下轮候选）
- **二级主题 chips 直达（第 7 轮首选）**：节点列顶部单行横滚 chips（安静款描边 pill，不要黑底与一级 tab 争层级）+ 列内锚点 scrollTo + 列内 scroll 感应高亮（UX 建议 chips 不 sticky，UI 建议 sticky——选题时倾向 UI 的 sticky 方案因「构图逻辑」列 15.5 屏深，需实测权衡）
- 详情页主题 chip 链到 `?cat=<所属分类>`（一行）
- tablist 方向键漫游（WAI-APG，危害小）
- 时间轴 scrollLeft 精确恢复 / 条目缩略图移动端放大（审查建议关闭，归档）

---
