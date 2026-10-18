# 设计迭代：首页与分类浏览建立阶段

本文件完整保留 2026-09-03 对应阶段的设计迭代记录，包含当时的审查、实现、验证和遗留。返回 [迭代日志索引](../../../.agents/design-log.md)；现行标准以 [DESIGN.md](../../../DESIGN.md) 与 [页面契约](../README.md) 为准，历史记录不覆盖用户后续决定。

## 第 1 轮（2026-09-03）—— 首页首屏重构 + 撕角彩蛋修复

### 审查清单摘要（4 个 SubAgent 并行）

**P0 共识（多维度交叉命中）**
- 首页塌陷：单产品 track ~800px 不溢出，滚轮/拖拽/键盘全部落空，下半屏死白，rail 断在屏幕中间（4/4 命中）
- 撕角全开 bug：clip polygon 退化为左下三角，front 层永远撕不干净，两层标题叠印成乱码（4/4 命中）
- 内页分类 tab 逻辑写反：只在搜索时出现且点击=退出搜索（3/4 命中）→ 列入第 2 轮

**P1 高票**
- 全站零强调色、rail 1px 细到看不见（UI）
- 时间轴无进度感：无渐隐边缘/进度条/位置提示（UX、动效）
- 移动端文案错误（「滚轮、方向键」对触屏不成立）（UX、动效、用户故事）
- 首页 hover 预览与封面同图，纯冗余（UI、UX、动效、用户故事 4/4 命中）
- 滚轮被超长列「劫持」（UX）→ 列入第 2 轮
- 拖拽松手无惯性、lerp 未按 dt 归一（120Hz 屏手感快一倍）（动效）
- 撕角可发现性低（96px 浅灰三角 + 12px 灰字）（UI、UX、动效）
- 灵感墙戏剧性不足，应暗房反转（UI）；首页缺 Attribution（用户故事，违反 CC BY 4.0）
- reduced-motion 只覆盖 CSS keyframes，JS 动效漏网（动效）→ 部分本轮修复，lightbox/corner-peel 遗留

### 选题
**首页首屏重构 + 撕角修复**。理由：首屏是 100% 用户第一眼所见，且撕角是全站唯一的「啊哈」时刻却全开即破版。

### 方案与实现
- `timeline.tsx`：rail 改为 `min-w-full` 全出血 + 右端 120px 渐隐（暗示延伸）；容器两端 40px mask 渐隐；新增左下角滚动进度条（仅可滚时显示）；lerp 按帧间隔 dt 归一化；拖拽松手惯性（指数平滑速度 × 220ms）；reduced-motion 直接 snap；移动端隐藏原生滚动条
- `corner-peel.tsx`：全开 700ms 后 front 层 `visibility: hidden`（修复叠印 bug）；首访 1.6s 自动微掀 72px 再落下（招手提示，reduced-motion 跳过）；纸角改白纸渐变 + 更强投影；提示文字加呼吸微动效
- `home-view.tsx`：h1 升至 text-5xl/6xl；产品节点加宽至 420px、封面 aspect-[16/10]、内容垂直居中（`center` prop）；新增「关于」文字节点（左缘粗线卡片）让首访者理解站点；日期标签去重（No.01 · 9 月 3 日）；移除冗余 hover 预览；提示文案按 hover 能力切换；底部补 Attribution
- `inspiration-wall.tsx`：**暗房反转**（bg-neutral-950，局部突破浅色基调——理由：撕开的瞬间需要明暗反差才成立「另一个世界」，且该层本就是 Playground 定位）；卡片放大至 w-40/52；补 Attribution
- `globals.css`：marquee 悬停暂停；hint 呼吸 keyframes；reduced-motion 覆盖新增动画

### 验证
- typecheck / lint / build（354 页 SSG）全部通过
- ego-browser 截图走查（1512×828）：首屏 rail 全出血、三节点成立、垂直居中生效（`/tmp/r1-home.png`）；撕角全开后 front 层完全隐藏、暗房灵感墙完整呈现（`/tmp/r1-wall.png`）——P0 bug 确认修复

### 遗留（下轮候选）
- 内页分类 tab 常驻 + 点击平滑滚动到节点（P0）
- 滚轮被超长列劫持（P1）
- 搜索匹配分类/二级主题名；空结果引导（P1）
- 灯箱：transform 版 FLIP、关闭按钮、图注、左右切换（P1/P2）
- 内页条目行节奏与缩略图放大；二级标题 sticky（P1）
- 详情页右栏空洞 + 同主题推荐 + prev/next 上移（P2）
- 全站强调色引入评估（P1，需谨慎）
- 内页时间轴/网格视图切换（P1）

---

## 第 2 轮（2026-09-03）—— 内页分类导航与浏览体验 + 诚实性修复包

### 审查清单摘要（4 个 SubAgent 并行，均先读 design-log 复审）

**P0 共识**
- 内页分类 tab 逻辑仍写反（连续两轮 4/4 命中；3/4 的「只能改一件事」）

**P1 高票与新发现**
- 首访招手动画完全不可见：72px < 静止手柄 96px，帧比对零像素变化（动效，实锤）
- 首页宽屏（≥1280px）轨道不溢出：文案承诺「滚轮探索」落空、两端渐隐在「撒谎」（UX/动效/用户故事 3/4 命中）
- 移动端内页 peek 仅 2px + 无 snap 可停在两列各半的破碎态；渐隐/进度条在原生模式全灭（UI/UX）
- 内页/灵感墙移动端 hint 文案错误（首页第 1 轮已修，内页漏改）（3/4 命中）
- 灯箱：无关闭按钮/图注/详情入口、layout 版 FLIP、reduced-motion 漏网、暗房下遮罩失效（4/4 命中）→ 留第 3 轮整体升级
- reduced-motion 对 lightbox/corner-peel transition 漏网；RM 下 marquee 停播导致灵感墙 1/3 内容不可达；撕角关闭时 marquee 空烧合成器（动效）
- 二级分组标题随列滚动丢失上下文（UI/UX）
- 搜索不匹配分类/二级主题名；空态无引导（UX/用户故事）
- 「关于」节点文案「向左回望」与升序排列方向矛盾（UI）
- hover-preview lerp 未 dt 归一；未缓存图先显空白白卡（动效）

### 选题
**内页分类导航与浏览体验 + 诚实性修复包**。tab 是连续两轮唯一 P0；顺手清掉所有「承诺与事实不符」的诚实性问题。灯箱整体升级留第 3 轮。

### 方案与实现
- `timeline.tsx`：`forwardRef` 暴露 `scrollToNode(index)`（自定义模式 lerp 平滑、原生模式 scrollTo smooth）；新增 `onScrollableChange` 回调；两端渐隐与 rail 右端渐隐改为仅 `scrollable` 时启用（诚实化）；移动端节点 72vw（peek ~70px）+ `snap-x snap-mandatory`/`snap-start`；新增 focus 捕获（Tab 焦点进入屏外节点时自动滚入视口）；进度条加粗 2px 加长 w-32
- `layout-gallery.tsx`：tab 常驻（移动端横向滚动收纳），点击 = 平滑滚动到对应节点；IO 位置感应高亮（多节点取最靠左），点击意图锁（手动滚轮/拖拽/键盘才解锁）；二级分组标题 `sticky top-0`；搜索匹配 +二级主题 +分类名；空态加「试试词」快捷 chips + 清除按钮；hint 双文案按 hover 能力切换并移到底部
- `home-view.tsx`：提示文案按 `scrollable` 联动（不可滚时说「点击节点，进入产品。」）；「关于」节点方向矛盾修正（「从最早的出发，向右生长」）
- `corner-peel.tsx`：招手 72→168px（超过静止手柄，帧比对可见）+ sessionStorage 每会话一次；reduced-motion 时所有 transition 置 none；根节点 `data-peel-open` 供 CSS 联动
- `hover-preview.tsx`：lerp dt 归一（与 timeline 同公式）；未缓存图 `img.complete` 后才显形；下缘 clamp 修正（预览图实际高约 300px）
- `lightbox.tsx`：reduced-motion 时 transition 置 none（整体升级留第 3 轮）
- `globals.css` + `inspiration-wall.tsx`：撕角关闭时 marquee 暂停（不空烧合成器）；RM 时 marquee 行容器可手动横滑（内容可达）

### 验证
- typecheck / lint / build（354 页 SSG）全部通过
- ego-browser 实测（1512×828）：首页提示文案联动为「点击节点，进入产品。」；内页 tab 常驻、点击「中国传统构图」平滑滚动至 -1848px 且高亮锁定（`/tmp/r2v-inner-click2.png`）；初始高亮最左节点「构图逻辑」；搜索「跨页」返回 9 条（二级主题匹配生效）
- 复测中出现过一次「截图与 DOM 高亮不一致」，复测两轮确认为自动化环境 artifact（HMR 帧），非代码问题

### 遗留（下轮候选）
- 灯箱整体升级：transform 版 FLIP、关闭按钮、图注（id+名称）、「查看详情」入口、左右切换、暗房下遮罩加深（P1，4/4 命中，第 3 轮首选）
- 滚轮被超长列劫持（tab 直达后弱化，仍存）
- 详情页右栏空洞 + 同主题推荐 + prev/next 上移 + query 同步 URL（P1/P2）
- 内页条目行节奏与缩略图放大（P1）
- 灯箱关闭动画飞回 marquee 旧位置（P2）
- 全站强调色引入评估（P1，需谨慎）
- 内页时间轴/网格视图切换（P1）
- 移动端撕角 HAND 96px 占比过大；招手动画触屏价值低（P2）

---
