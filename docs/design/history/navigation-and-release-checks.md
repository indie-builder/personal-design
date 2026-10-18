# 设计迭代：主题导航与收官回归阶段

本文件完整保留 2026-09-03 对应阶段的设计迭代记录，包含当时的审查、实现、验证和遗留。返回 [迭代日志索引](../../../.agents/design-log.md)；现行标准以 [DESIGN.md](../../../DESIGN.md) 与 [页面契约](../README.md) 为准，历史记录不覆盖用户后续决定。

## 第 7 轮（2026-09-03）—— 二级主题 chips 直达 + focus trap 漏洞修复

### 审查清单摘要（4 个 SubAgent，收紧轮：验证第 6 轮 + chips 设计输入）

**第 6 轮回归验证**：portal（截图级通过）、inert（Tab 序 50+ → 4-5 站）、swipe 残留、初始聚焦、焦点还源全部通过。

**P1（3/4 命中，第 6 轮引入的回归）**
- focus trap 未过滤 `sm:hidden` 隐藏按钮：桌面端 Tab 死停在「下一张」（first 锚点是隐藏按钮，focus 静默落空）、Shift+Tab 泄漏出 dialog——「查看详情」对键盘用户永远不可达。第 6 轮只验证了正向路径

**P2**
- 撕角 Enter 打开后焦点滞留在已隐藏手柄上，首个 Tab 落在「拉回来」（再 Enter 又关掉了）

**chips 设计输入（三维度收敛）**
- sticky 之争由动效维度的第三方案终结：**chips 放 `LifelineNode` 头部插槽**（label 与滚动列之间），常驻可见、零 sticky 堆叠、不占滚动空间
- 锚点滚动：手写 rAF tween（`clamp(200+dist×0.1, 260, 550)`ms，ease-out cubic），不用原生 smooth（时长随距离线性膨胀）；RM 直接落位
- 高亮感应：rAF 节流 scroll + 锚点数组比较（h3 sticky 恒 intersecting，IO 不可信）；锚点随 RO 重算
- chips 条自带 deltaX 滚轮拦截（否则被 timeline wheel 放大成整轴位移）；溢出时右缘渐隐
- 样式：安静款描边 pill，active 只加深描边（不与一级 tab 黑底争层级）
- 与 tab 的 intentLock 天然正交（只动列内 scrollTop）

### 选题
**二级主题 chips 直达**（第 6 轮交接的既定选题）+ trap 漏洞先行修复。

### 方案与实现
- `timeline.tsx`：`LifelineNode` 新增 `header` 插槽（label 与列之间，常驻可见）
- `layout-gallery.tsx`：新增 `SubChipsBar`——单行横滚 chips + 点击 tween 直达（目标 `offsetTop - column.offsetTop`，clamp maxScroll）+ rAF 节流 scroll 感应高亮 + 溢出右缘渐隐 + active chip scrollIntoView + deltaX 滚轮拦截；分组 div 挂 `data-sub-slug` 作为锚点
- `lightbox.tsx`：trap 的 focusable 查询过滤 `getClientRects().length > 0`
- `corner-peel.tsx`：Enter/Space 打开后 750ms 焦点移入墙内首个按钮
- 过程中修两处 lint 拦截：useCallback 未导入；tween 用 `performance.now()` 触发 react-hooks/purity（改 rAF 时间戳）

### 验证
- typecheck / lint / build（354 页 SSG）全部通过
- ego-browser 实测：8 条 chips 栏（首栏 7 个主题名正确）；点击「视点、景深与空间感」→ 列 scrollTop 5656 精确落位、高亮同步、sticky h3 确认到达（截图 `/tmp/r7v-chips-scrolled.png` 四列 chips 栏与各列高亮状态正确）
- trap 修复：dialog 内可见可聚焦元素 = [查看详情, 关闭, 上一张, 下一张]（隐藏按钮已过滤）

### 遗留（下轮候选）
- tablist 方向键漫游（WAI-APG，危害小）
- `?q=&cat=` 组合链接清除搜索后 cat 语义丢失（P2，稀少）
- 归档关闭项（不再评估）：时间轴 scrollLeft 精确恢复、条目缩略图放大、tab 栏两行折行、全站强调色
- 剩余轮次（8-10）若无实质选题，按停止规则提前汇报

---

## 第 8 轮（2026-09-03）—— scrollIntoView 污染 P0 修复 + 渐隐对齐

### 审查清单摘要（4 个 SubAgent）

**P0（4/4 独立命中，第 7 轮引入的回归）**
- `SubChipsBar` 的「active chip 保持可视」effect 在 mount 时对 8 个栏各执行 `scrollIntoView({inline:'nearest'})`——它滚动**所有可滚动祖先**（`overflow:hidden` 的时间轴容器也是程序化可滚动容器），容器被拖到 scrollLeft=1560：
  - 冷启动首屏从「网页与 UI」（第 5 类）开始而非「构图逻辑」，IO 把 URL 污染成 `?cat=05-web-ui`
  - `?cat=` 分享链接双重位移（transform -1848 + scrollLeft 1560），整屏空白
  - 所有 tab 点击视觉失效（transform 值正确但叠加 scrollLeft 后目标恒在屏外）
- 实锤方式：UI 维度用 `addScriptToEvaluateOnNewDocument` 把 scrollIntoView 置 noop 后冷启动恢复正常；用户故事维度手动 scrollLeft=0 后单发一次 scrollIntoView 立即复现
- **教训（连续第三轮验证盲区埋雷：r5 键盘冲突、r6 focus trap、r7 scrollIntoView）**：新交互验收必须包含「冷启动首屏」和「带参分享链接首屏」两条路径，不能只测点击驱动的中间态

**P1**
- 移动端 EDGE_FADE=40 > 轨道 px-6=24：第一节点左缘 16px 被渐隐吃掉，「350 种」「布局参考」首字缺半（桌面 padding 40 恰好对齐所以没暴露）

**P2**
- chips tween 途中高亮翻牌（点击瞬间「亮→灭→再亮」）；tablist 语义与锚点行为不符（无 tabpanel/aria-controls，应为 nav + aria-current）；列底残行读作杂点（记录不修）

### 选题
**P0 修复 + 冷启动回归验收**（4/4 无悬念），顺手带渐隐对齐与两个 P2。

### 方案与实现
- `layout-gallery.tsx`：active chip 滚动收敛为只动 chips 条自身——手动算 `chipLeft = chip.offsetLeft - bar.offsetLeft` 与 bar 视口比较后赋 `bar.scrollLeft`，零祖先副作用；tween 加点击意图锁（期间 scroll 感应不抢高亮，终点一致后自然同步）；一级 tab 与 chips 的 role=tablist/tab 改 `nav` + `aria-current`
- `timeline.tsx`：渐隐宽度改 `min(EDGE_FADE, track paddingLeft)`（RO 中实测 padding，移动端 24 不再切字）

### 验证
- typecheck / lint / build（354 页 SSG）全部通过
- **冷启动回归（本轮核心验收）**：无参首屏 scrollLeft 从 1560 → 40（残留 40px 稳定常量，来源未查明但无症状）、node0 可见、active tab=构图逻辑、URL 无污染（`/tmp/r8v-cold.png`）；`?cat=07` 分享链接 node6 可见、active=中国传统构图
- tab 点击「影视画面」：transform -1848 + node5 可见（left=184）、高亮正确——P0 三症状全消
- 停止规则评估：本轮有实质 P0，「连续无实质改进」计数清零

### 遗留（下轮候选）
- scrollLeft=40 残留常量排查（无症状，低优先）
- 列底残行视觉杂点（记录不修）
- 归档关闭项不再评估（scrollLeft 精确恢复、缩略图放大、tab 折行、强调色）
- 剩 2 轮（9-10），无实质选题则按停止规则提前汇报

---

## 第 9 轮（2026-09-03）—— 移动端 snap 吃字 P1 + 清除搜索落点 P1 + 五个 P2

### 审查清单摘要（4 个 SubAgent）

**P1（2 条，UX + 用户故事维度各命中 1 条）**
- 移动端 375px 冷启动：`snap-x snap-mandatory` 把容器吸附到 scrollLeft=24（越过 track px-6 padding），第 8 轮按「scrollLeft=0 只 fade padding 区」校准的左缘渐隐正好压住实际内容——「350 种」读作「50 种」、「演示文稿」读作「示文稿」，内页首列同样被吃。第 8 轮只验证了桌面路径，移动端 snap 位移使校准前提失效（截图 `/tmp/r9-m-home2.png`）
- 清除搜索后三方不一致：点 tab（滚到 node6）→ 搜索 → 清空，时间轴重挂载在 scrollLeft≈0，但 active tab 与 URL `?cat=` 仍是旧分类，intentLock 持有期间 IO 不自我纠正，不一致持续到手动滚动。第 4 轮「返回旅程不丢状态」在这条路径上漏了位置恢复（`/tmp/r9-after-clear.png`）

**P2（5 条采纳）**
- RM + 原生滚动模式下 tab 点击仍走 ~700ms 平滑滚动（native 分支漏判 reduced-motion，自定义分支早有）
- 退出搜索时 8 节点重播 ~1.5s 入场级联（条件渲染卸载/重挂载所致，高频往返拖节奏）
- 详情页面包屑「布局参考」href 无参，回到列表状态全丢（浏览器返回键却能完整恢复，两条回路行为不一致）
- 详情页一级分类 chip 视觉与全站可点 chip 同构但不可点，断了一条导航回路（第 6 轮遗留候选）
- 灵感墙 hint 触屏仍承诺「悬停暂停」（第 2 轮双文案方案的漏网点）

**未采纳**：corner-peel 单击无反馈（审查结论：affordance 是拖拽，可辩护设计，不修）；UI/动效维度无 P0/P1。

**附带线索**：已知遗留「scrollLeft=40 残留常量」移动端实测残留 24，恒等于轨道左 padding——疑似某处以 `inline:'start'` 语义对齐首节点，下轮排查的强线索。

### 选题
两个 P1 都修（移动端首屏文字被吃是真机级缺陷；落点不一致是诚实性问题），带五个低成本 P2。

### 方案与实现
- `timeline.tsx`：native 容器加 `scroll-pl-6 sm:scroll-pl-10`（scroll-padding 对齐 track padding，snap 归位到 padding 之后）；scrollToNode native 分支按 `matchMedia('(prefers-reduced-motion: reduce)')` 选 auto/smooth
- `layout-gallery.tsx`：pendingNode effect 加兜底——`!searching` 且 pendingNode 为空且 activeCategory 索引>0 时 scrollToNode 回去（用 activeCategoryRef 镜像避免依赖触发反复滚动）；`timelineReentry` state（进入过搜索态才置位，不能首挂载置位——`animation:none` 会掐断首屏入场）+ 容器加 `lifeline-no-entry`
- `globals.css`：`.lifeline-no-entry .lifeline-rail, .lifeline-no-entry .lifeline-node { animation: none }`
- `[id]/page.tsx`：抽 `categoryHref = /products/layout-compositions?cat=<slug>` 常量，面包屑与一级分类 chip（span→Link）共用；二级主题 chip 维持 span
- `inspiration-wall.tsx`：复用 home-view 的 `[@media(hover:hover)]` 双 span 模式，触屏文案去掉「悬停暂停、」

### 验证
- typecheck / lint / build（354 页 SSG）全部通过
- ego 9 项走查全过（站点已切 portless，走查地址 **https://personal-design.localhost**）：移动端首屏 scrollLeft=0、文字完整（A/B）；tab→搜索→清空滚回 node6、高亮一致（C）；RM 下 native 滚动瞬时落位（D，0 个 scroll 事件 vs 对照 29 个）；退出搜索无级联、首屏级联保留（E）；面包屑带参返回落点正确（F）；chip DOM 语义（G）；触屏 hint 无「悬停暂停」（H）；桌面冷启动与 `?q=&cat=` 带参回归（I）
- 环境变更：用户中途把 dev 切到 portless（`pnpm dev` → https://personal-design.localhost，绕过用 `pnpm dev:direct`）；AGENTS.md 已同步该约定
- 停止规则评估：本轮有实质 P1×2，计数清零

### 遗留（下轮候选，第 10 轮为最后一轮）
- scrollLeft=padding 残留常量排查（线索已收窄：恒等于轨道左 padding，疑似 `inline:'start'` 对齐副作用，无症状）
- ego 工具侧坑记录：`fillInput('')` 不清受控 input（用真实键盘 Backspace）、窄视口 click helper 失灵（用 el.click()）、`setEmulatedMedia`/touch 模拟跨导航不持久
- 归档关闭项不再评估（scrollLeft 精确恢复、缩略图放大、tab 折行、强调色、corner-peel 单击）
- 第 10 轮跑完后按用户上限汇报收工

---

## 第 10 轮（2026-09-03，最终轮）—— 对比度/tab 渐隐/404 三个 P2 收官

### 审查清单摘要（4 个 SubAgent）

- **UX 维度：无实质发现**（合法停止信号）。验证矩阵全绿：冷启动双路径、r9 全部修复回归保持、交互链路（tab/搜索/灯箱/详情翻页/撕角/hover 预览）无断点。附带结论：遗留项「`?q=&cat=` 清除搜索丢 cat」两条路径实测 cat 均保留且落点正确，疑似已被 r9 兜底顺带消解，从遗留清单移除。
- **动效维度：无实质发现**（合法停止信号）。r9 回归全保持；节奏/缓动/惯性/反馈/RM 合规全链路无新发现；RM 下 hover 即时反馈保留属 WCAG 2.3.3 允许范围，不报。
- **UI 维度：2 个 P2**——① 浅底上 neutral-400（#a3a3a3，~2.4:1）用于非装饰文本：CC 署名（合规文本）、面包屑（导航）、搜索空态（主反馈）；② 一级 tab 栏移动端横滚无溢出渐隐，第三个 tab 被硬切半个字，与同页 chips 栏两套表现。
- **用户故事维度：1 个 P2**——全中文站缺 not-found.tsx，坏 URL 落到 Next.js 默认英文 404，零导航零品牌，唯一出路是浏览器返回键。

### 选题
UX/动效已收敛；采纳 UI 2 条 + 用户故事 1 条（均为单 token/模式复用/15 行级改动），作为收官修复。

### 方案与实现
- `attribution.tsx` / `[id]/page.tsx` 面包屑 / `layout-gallery.tsx` 空态：text-neutral-400 → 500（#737373，~4.3:1 接近 AA）；条目编号、placeholder、图标等纯辅助维持 400
- `layout-gallery.tsx`：tab 栏复用 SubChipsBar 口径（ResizeObserver + scrollWidth>clientWidth+1）加右缘 32px mask 渐隐 + pr-4；lg:flex-wrap 折行后无横向溢出，mask 自然禁用，无需断点判断
- 新增 `app/not-found.tsx`（22 行 server 组件）：中文「页面不存在或已移动」+ 回首页/去布局参考两个链接，沿用详情页字号阶梯与站内按钮样式

### 验证
- typecheck / lint / build 全过（354 页 SSG + 新增 `/_not-found`）
- ego 走查 4 项全过：404 桌面/移动中文文案+双链接可跳（A）；tab mask 移动有/桌面无（B，scrollWidth 实测佐证）；三处 computed color #737373（C，canvas 像素换算）；冷启动与带参回归（D，本次连 scrollLeft=40 残留都未出现）

### 收官状态
- 用户设定的 10 轮上限已到；UX/动效两维度本轮明确「无实质发现」，站点进入收敛状态
- 遗留归档（均无症状，不再跟踪）：scrollLeft=padding 残留常量、列底残行杂点、tablist 方向键漫游（P2）
- 归档关闭项（不再评估）：scrollLeft 精确恢复、缩略图放大、tab 折行、全站强调色、corner-peel 单击
