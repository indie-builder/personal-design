---
name: Personal Design 产品集
description: OpenDesign 中性视觉语言下的设计参考门户，首页选产品、分类浏览、画册与作品阅读
colors:
  workspace: "#ffffff"
  paper: "#ffffff"
  plate: "#fafafa"
  body: "#494949"
  ink: "#202020"
  ink-soft: "#5c5c5c"
  ink-faint: "#5c5c5c"
  hairline: "#ededed"
  hairline-strong: "#dbdbdb"
  subtle: "#ededed"
  border-hover: "#bdbdbd"
  control-border: "#848484"
  accent: "#353535"
  dark-workspace: "#202020"
  dark-paper: "#202020"
  dark-plate: "#353535"
  dark-body: "#ededed"
  dark-ink: "#fafafa"
  dark-ink-soft: "#bdbdbd"
  dark-ink-faint: "#bdbdbd"
  dark-hairline: "#494949"
  dark-hairline-strong: "#5c5c5c"
  dark-subtle: "#494949"
  dark-border-hover: "#848484"
  dark-control-border: "#848484"
  dark-accent: "#ededed"
  book-terracotta: "#b94a35"
  book-linen: "#d6c7a6"
  book-teal: "#557477"
  book-ochre: "#d4ac49"
  book-blue: "#465676"
  book-rust: "#a65e47"
  book-olive: "#707453"
  book-ivory: "#ddd5c3"
  book-paper: "#f5f1e7"
  book-ink: "#38362e"
  book-muted: "#625c50"
typography:
  workspace-title: {"fontFamily": "'Albert Sans', -apple-system, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif", "fontSize": "17px", "fontWeight": 600, "lineHeight": 1.3, "letterSpacing": "0"}
  workspace-title-mobile: {"fontFamily": "'Albert Sans', -apple-system, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif", "fontSize": "16px", "fontWeight": 600, "lineHeight": 1.3, "letterSpacing": "0"}
  home-project: {"fontFamily": "'Albert Sans', -apple-system, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif", "fontSize": "24px", "fontWeight": 500, "lineHeight": 1.35, "letterSpacing": "0"}
  home-project-mobile: {"fontFamily": "'Albert Sans', -apple-system, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif", "fontSize": "22px", "fontWeight": 500, "lineHeight": 1.35, "letterSpacing": "0"}
  detail-title: {"fontFamily": "'Albert Sans', -apple-system, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif", "fontSize": "32px", "fontWeight": 500, "lineHeight": 1.35, "letterSpacing": "0"}
  detail-title-mobile: {"fontFamily": "'Albert Sans', -apple-system, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif", "fontSize": "26px", "fontWeight": 500, "lineHeight": 1.35, "letterSpacing": "0"}
  media-title: {"fontFamily": "'Albert Sans', -apple-system, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif", "fontSize": "16px", "fontWeight": 500, "lineHeight": 1.5, "letterSpacing": "0"}
  body: {"fontFamily": "'Albert Sans', -apple-system, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif", "fontSize": "14px", "fontWeight": 400, "lineHeight": 1.75, "letterSpacing": "0"}
  control: {"fontFamily": "'Albert Sans', -apple-system, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif", "fontSize": "14px", "fontWeight": 500, "lineHeight": "22px", "letterSpacing": "0"}
  caption: {"fontFamily": "'Albert Sans', -apple-system, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif", "fontSize": "13px", "fontWeight": 400, "lineHeight": 1.75, "letterSpacing": "0"}
rounded:
  xs: "2px"
  control: "4px"
  media: "8px"
  card: "12px"
  panel: "16px"
  pill: "999px"
  circle: "50%"
spacing:
  page-x: "48px"
  page-x-compact: "24px"
  page-x-mobile: "20px"
components:
  button-default:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.pill}"
    padding: "10px 12px"
  button-subtle:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  button-icon:
    rounded: "{rounded.circle}"
    width: "44px"
    height: "44px"
---

# Personal Design · 全站设计标准

## Overview

**Creative North Star: "随手可查的设计参考"**

采用 OpenDesign 中性视觉语言、Albert Sans 与中文零字距。页面保持开放、轻量，真实作品承担视觉表达；控件在操作时给出明确反馈。实体书材质仅用于布局参考书架、画册及首页对应预览；灵感集采用作品网格和详情阅读。

**状态：现行标准；更新日期：2026-09-25。** 本文件是全站视觉与交互规范，不是历史变更日志，也不是全站已通过无障碍或视觉验收的认证。

**Key Characteristics:**

- 中性双主题、开放阅读平面、真实媒体。
- 按钮胶囊、图标按钮圆形；两集合支持即时搜索。
- 中文清晰排印，空间建立层级。
- 动效表达操作与去向，键盘和减少动态效果即时响应。

### 权威与维护

用户最新明确决定优先；产品与内容边界见 [PRODUCT.md](PRODUCT.md)，页面流程见 [设计文档入口](docs/design/README.md)。本文件规定现行视觉标准，CSS 与组件是实现证据；发现偏差必须记录并处理，不得仅因为代码已存在就将偏差改写为规则。

顶部 tokens 与 `.impeccable/design.json` 是源码核对后的文档快照，不参与运行时主题计算。运行时 token 统一在 [globals.css](apps/web/app/globals.css)，组件状态在相邻 CSS Module。改动时同步对应规范，避免再追加“前条由后条覆盖”的时间线。

[OpenDesign 迁移说明](docs/design/open-design/rules.md) 解释来源与有意适配；`source/`、历史交付报告与旧截图只作证据，不是当前页面要求。不恢复原项目的运行时、菜单或 Agent 指令。

## Colors

### Primary

`ink` 用于主要文字、选中状态及主按钮；`accent` 用于主按钮悬停。采用中性强调，不另造全站品牌装饰色。

### Neutral

| Token | 用途 |
| --- | --- |
| `workspace` / `paper` | 页面与普通表面 |
| `plate` | 次级媒体衬底、subtle 操作 |
| `body` | 正文 |
| `ink-soft` / `ink-faint` | 辅助说明；不能以极淡颜色代替可读性 |
| `hairline` / `hairline-strong` | 分组细线、控件边界 |
| `subtle` / `border-hover` | 悬停表面与边界 |
| `control-border` | 保留的控件边界 token |

明暗主题使用同一角色，`dark-*` 是文档中的深色对应值，运行时由 `html[data-theme]` 覆盖。默认跟随系统，保留用户选择与跨标签同步。不得在组件内再建第二套全站主题机制。

### 局部材质

`book-*` 仅用于实体书表面；书脊的前景／背景配对、尺寸以 [layout-bookshelf.tsx](apps/web/components/layout-bookshelf.tsx) 的 bindings 为准。米白纸面在双主题下保持材质色，外围工具栏仍跟随全站主题。灯箱采用局部恒定暗房与亮色焦点环。

线路色虽仍在源码中保留，但不属于当前可用视觉色板；LED 色不再列入规范。真实媒体自身颜色不受中性色约束。

AI Coding 词典为用户确认的局部例外：保留全屏参考图谱，将统一标题回退导航叠放在画布左上角，采用放射动效、清晰节点标签及收起的圆形搜索入口。背景与前景色跟随本项目中性主题，字体使用 Albert Sans；七个章节以低饱和浅色节点区分，径向碰撞修正保留原投影角度。图谱与双语阅读面直接由本站 Next 组件实现，复用内容包数据，不运行独立网页或 iframe。不恢复配色开关和音效。

普通文字对比度目标至少 4.5:1，大字与必要界面图形至少 3:1；状态须同时用文字、图标、下划线或原生语义表达。记录验证证据后才能声称达标。

## Typography

字体角色及数值见顶部 `typography`。正文和界面使用本地 Albert Sans；中文回退 PingFang SC／Microsoft YaHei。系统等宽字体仅用于编号等需要等宽的内容，不作为技术风格装饰。

| 角色 | 应用 |
| --- | --- |
| `workspace-title` | 首页与产品首页页头，h1 继承品牌链接字号 |
| `home-project` | 首页作品名称；窄屏使用 mobile 角色 |
| `detail-title` | 独立作品详情；窄屏使用 mobile 角色 |
| `media-title` | 通用媒体标题 |
| `body` | 正文与一般说明 |
| `control` | 共享操作按钮 |
| `caption` | 日期、作者及辅助信息 |

首页和产品首页只有页头 h1，不在正文重复一个大标题；独立详情由作品名称承担 h1，页头产品名降为普通文本。不存在统一的“所有页面标题 36px”规则。

中文标题字距为 0，通常行高 1.35；正文通常 1.75，个人网站长介绍沿用 1.8。长说明最大约 68ch，长标题允许换行，不截掉唯一识别信息。日期、页码与计数使用 tabular-nums。书脊竖排名称、纸页小字号及海报内文字属于局部内容，不扩展为全站正文规则。纸页页码使用 book-muted 对应色，在 book-paper 上的对比度约5.88:1；尺寸例外不豁免文字可读性要求。

## Layout

页面以内容和操作组组织，不给每段资料加卡片。页头与内容容器各自有职责，不强制所有页面同宽。

| 表面 | 当前容器与响应方式 |
| --- | --- |
| 全站页头 | 最大 1440px；首页最小高 88px，内页 72px；窄屏 72px |
| 首页 | 横向时间轴；列宽随断点为 420 / 380 / 340 / 290px；仅轨道允许横向溢出 |
| 布局参考 | 外层 1440px、书架 1040px、画册 1160px；900 / 600px 断点 |
| 灵感网格 | 最大1440px；4列，1199px以下3列、759px以下2列、359px以下1列，纵向自动追加 |
| 灵感详情 | 开放阅读布局，图片保持比例，视频按剩余视口适配 |
| AI Coding 词典 | 全屏知识图谱、左上角悬浮标题导航；桌面右侧阅读面 clamp(340px,34vw,520px)，800px 及以下为底部 68dvh 非模态阅读面，保留图谱可见区域 |
| 布局旧作品链接 | 定位同一画册的对应书页；有图时直接放大 |
| 个人网站介绍 | 外层最大 1296px，桌面左右 48px，正文说明最大 68ch |

首页时间轴日期只显示日期值，不追加“收录”“上线”或其他日期性质标签；后续新增作品也按此呈现。

常规横向留白使用 `page-x`、`page-x-compact`、`page-x-mobile`；具体切换沿用所属组件，不把 600、639、900、1000、1100、1440px 混成一个全站断点。分组间距通常使用 8、12、16、24、32、48、64px，控件及实体书尺寸按语义例外保留。

以 1280 / 1440px 桌面为设计重点，小屏保证已有内容和操作不被裁掉；不据此扩展新的移动端功能。分类筛选与追加不触发整墙位移动画。图片按原比例显示；布局图鉴在灯箱保持自然阅读尺寸。灵感网格媒体使用 contain；详情图片按比例自然阅读。

## Elevation & Depth

普通页面使用实色、留白与细线建立层级，不使用装饰性玻璃或通用悬浮投影。图片内容与作者信息直接落在阅读平面。

实体书可使用书脊内阴影、书架投影、书板厚度、双面纸叶及中央装订。相关数值归 [layout-bookshelf.module.css](apps/web/components/layout-bookshelf.module.css) 和 [book-opening.module.css](apps/web/components/book-opening.module.css)，不得应用到普通按钮。纸页中央固定轻阴影，翻动纸叶阴影随动作出现并归零，仅活动纸叶声明 will-change。


## Shapes

文字按钮使用 `pill`，图标按钮使用 `circle`，媒体使用 `media`。`control` 仍供小提示与特定局部控件使用，不能据其存在把共享按钮恢复为方角。

通用分类为无外框下划线标签；灵感分类使用同一套标签。灵感媒体沿用8px圆角。两集合使用即时搜索输入，支持清除和斜杠聚焦，不需要提交。书脊、封面和装订允许自己的不对称微圆角。保留的 `card` / `panel` token 不意味着需要为内容新建面板。

## Components

### 按钮与图标

复用 [Button / buttonClassName](apps/web/components/button.tsx)。导航使用 Link / a，动作用 button，不能为了统一外观损失原生语义。

- 共同基线：最小高 44px、14px / 500 / 22px 文字、8px 图文间距；常规内边距 10px 18px，ghost 横向 12px。
- `default`：paper 底、ink 字、细边界。`primary`：ink 底、paper 字。`ghost`：透明、ink-soft 字。`subtle`：plate 底。
- 图标按钮为 44×44px；共享图标 18px、线宽 1.6px。站内进入向右，返回向左，外链向右上。
- 默认焦点环 2px、外偏 3px；页头、分类和内容链接可按可视间距使用 4–8px 外偏。
- 原生 disabled 或 aria-disabled 表达禁用，必须同时阻止动作；仅降低透明度不等于实现禁用。
- 精细指针悬停改变对应表面；按下缩至 .96。键盘及减少动态效果取消空间反馈。

完整用途与例外见 [控件标准](docs/design/controls/README.md)。

### 分类与主题

两集合支持即时搜索。普通标签分类复用CategoryTabs，灵感集复用CategoryTabs；布局保留分类书籍及既有theme链接筛选，主题图鉴列表可选择对应书页。



### 导航、内容与媒体

全站外壳只提供首页／产品上下文返回和主题操作；首页另有已确认的头像彩蛋。当前层级有返回书架时，由 WorkspaceBack 替换页头动作，不重复添加正文返回栏。

灵感集恢复静态作品网格：中文分类标签、结果数量、纵向自动追加；原生作品链接进入详情。详情显示标题、作者、中文分类、原作、实际说明与媒体；视频原生控制、图片可放大。无放映机、类型旋钮或专注放映台。

布局画册图片点击即放大阅读，不增加二次详情跳转；标题旁的页码目录可直接选图鉴定位，跨页跳转即时。左页页脚放“上一页”，右页页脚放“下一页”；保留页码，首末边界禁用，取消书本两侧悬浮翻页按钮。画册从书架打开时记录一级历史，页头返回和原生后退恢复书脊焦点与位置，不制造重复书架记录。布局灯箱保留焦点约束、Esc、背景inert、滚动锁、加载失败恢复及关闭后焦点回归。

普通作品视频可视时默认静音循环，离屏／后台／减少动态效果暂停；灵感详情播放器保留原生控制。个人网站宣传片是已确认的例外：无原生控制栏，点击或空格／Enter 切换播放，保留可访问名称与焦点；悬停、聚焦或暂停时显示轻量播放提示。个人网站两段介绍直接静态展示，不恢复龙卷风或逐字显现。

### AI Coding 词典阅读面

标题与关闭操作常驻，正文独立滚动；以标题、章节、中英释义、内容定位、中文解读、完整英文正文、关联目录建立阅读顺序。中英文同屏，原文表格保留语义；关联词条按章节组成紧凑文字目录，使用原生链接。底部相邻导航显示完整名称并允许换行，首末边界禁用。关闭与 Esc 清除选择并将焦点返回搜索入口；键盘与减少动态效果即时完成。所有尺寸统一使用页头标题旁的返回操作，不另放图谱内返回按钮。移除分享、Copy Markdown 及旧详情组件，不仅隐藏控件。具体流程见 [详情阅读区契约](docs/design/execution/ai-coding-dictionary-detail.md)。

### 动效

#### 进入与退出必须成对设计

**成对动效规则：有进入动效的可逆操作，必须同时定义并实现对应的退出路径；目标页面的入场不能代替原页面的退场。** 此规则适用于全站页面进入／返回、书籍打开／合拢、图片放大／关闭，以及以后新增的同类交互。明确采用即时反馈的普通分类和键盘路径保持即时，不为满足“成对”而添加无意义动画。

| 要求 | 交付标准 |
| --- | --- |
| 双向完整 | 实现进入时一并列出所有站内返回／关闭入口，逐条覆盖，不能只接入其中一个按钮 |
| 离开可见 | 指针返回时，原表面必须在仍挂载时完成短退出，再切换路由或业务状态；不能先卸载，再给目标页面补淡入 |
| 关系连续 | 退出方向、缩放中心和物体行为应解释回到哪里；页面退回、画册合拢、图片回到触发处各有对应语义，不统一套同一个淡出 |
| 节奏克制 | 退出通常短于进入，不要求完整倒放较长的展示序列；使用下表的已选参数，新的长序列须明确等待预算与跳过方式 |
| 接续稳定 | 退出最终帧保留到目标DOM实际提交／旧DOM移除后再清理，不能仅在动画结束时取消；不得闪回原内容、出现残影或留下透明阻挡层。允许提前预取 |
| 几何稳定 | 同一导航的整页过渡与子项首次入场不能叠加驱动位置；共享标题的目标须在稳定布局中测量，避免结束时跳回基准位置 |
| 恢复同帧 | 返回的滚动与焦点恢复必须在目标DOM提交后、首次绘制前完成；禁止先显示默认位置再在下一帧跳回记录位置 |
| 原生行为 | 保留链接、修饰键新标签、复制地址、筛选、滚动与焦点恢复；站内按钮回退与浏览器原生后退分别验证，不能笼统宣称两者均支持 |
| 即时替代 | 键盘、减少动态效果及后台路径不等待空间动画，直接完成相同的最终动作与恢复 |
| 可中断 | 重复点击、快速反向操作、Esc、偏好变化、动画异常与完成事件丢失均有明确出口；取消旧动作不能在稍后误提交旧路由 |

设计说明须写清“从哪个表面离开 → 如何退场 → 何时切换 → 返回后恢复什么”。评审必须同时检查正向和反向，不能仅根据进入流畅或代码含有 animation / transition 判定完成。

#### 时长与输入状态

| 场景 | 当前参数（实现快照） |
| --- | --- |
| 通用进入／退出 | token 为 200 / 140ms，ease-out 为 cubic-bezier(.23,1,.32,1) |
| 共享按钮 | 颜色 150ms，缩放 100ms；不统一改成页面过渡时长 |
| 进入作品 | 箭头推进、按下 .975；标题位置衔接与内容推进 360ms；进入路由立即开始 |
| 页面返回 | 原页面先180ms退场，再提交返回路由；目标页360ms接续；预取立即启动，保留筛选和滚动策略 |
| 画册返回书架 | 左页向右合拢、整册退后淡出260ms，再切回书架并恢复焦点 |
| 首页初现 | 260ms，列间 40ms；仅独立首次呈现启用；整页导航期间不叠加作品块位移 |
| 普通分类／追加 | 结果即时，无整墙入场 |
| 书脊悬停 | 260ms，小幅提起 |
| 分类开册 | 当前抽书 1680ms，封面对齐 360ms，翻开 720ms；属于书籍专属序列，不能标成通用 480ms |
| 画册翻页 | 680ms，双面纸叶；方向键与减少动态效果应即时 |
| 灵感切卷反馈 | 卷盘260ms旋转／透明度反馈；键盘／减少动态效果取消动画 |
| 灵感专注进入／返回 | 右侧进入220ms位移／透明度，返回160ms退场后恢复全览；键盘／减少动态效果即时，无dialog或FLIP |
| 灯箱 | 指针进入 200ms、退出 140ms；键盘即时 |

这些时长记录已选定的指针效果，不作为所有输入方式必须播放的时长。体验验收以以下状态矩阵为准；是否缩短指针展示时长另作设计决策，不能因“数字符合表格”就认定体验通过。

| 输入或变化 | 循环预览 | 首页路由 | 书架／画册 |
| --- | --- | --- | --- |
| 普通指针 | 可视且前台时运行 | 进入立即导航；返回先短退场，再提交导航 | 抽书、对齐、翻开；返回先合册；序列中忽略重复操作 |
| 键盘 | 显示稳定内容，不推进书籍队列 | 直接导航，不创建空间动画 | 直接进入目标跨页；方向键直接翻页 |
| 减少动态效果 | 静态内容，真实视频允许用户手动播放 | 不创建空间动画 | 直接进入目标跨页 |
| 动效中改用键盘／开启减少动态效果 | 停止队列而非零时长循环 | 取消活动动画并恢复真实标题，导航继续 | 结束展示序列并提交目标跨页，立即解除busy |
| 页面进入后台 | 暂停内容预览 | 清理活动动画与替身标题 | 完成目标跨页，解除busy，不等待后台帧 |
| Esc | 不触发新预览 | 保留原生导航语义 | 抽书时返回书架；已进入画册时返回书架；恢复书脊焦点 |
| 完成事件丢失／动画异常 | 不依赖零时长事件驱动下一项 | 提交后最多500ms清理标题层 | 抽书2.1s保护直接开册；开册4.5s保护恢复可操作状态 |

工程契约：交互入口统一读取 [instantMotion](apps/web/lib/motion.ts)，活动动画与循环预览使用同文件的 `observeMotionPolicy` 订阅输入方式、系统偏好和前后台变化。键盘CSS归零只作为视觉兜底，不能代替组件停止队列、取消WAAPI和提交业务状态。页面返回与画册关闭统一使用 `playExit`，保留离开中的DOM至退出完成；键盘、减少动态效果和后台路径直接完成返回，退出超时按时长加120ms兜底。取消退出动作不误提交旧导航，切换偏好则直接完成当前返回。动画完成事件不是唯一的状态出口；取消、超时与正常结束必须幂等清理。偏好订阅通知在当前输入事件结束后执行，让Esc等取消动作先完成，避免被模式切换抢先提交。前台恢复后，循环预览可继续当前书目，不凭零时长animationend消耗下一本。

验收分为三个独立门槛：

1. **行为存在**：普通指针进入与返回均有实际动画；退出作用于原表面，且在路由／状态切换前启动。需要共享标题或媒体衔接的路径必须验证对应元素参与。
2. **状态正确**：退出结束后到达正确上级，保留查询、滚动与焦点；键盘／减少动态效果不创建空间过渡；取消、快速反向操作及超时后没有残留替身、隐藏标题、锁定状态或错误路由。
3. **视觉连续**：实看完整进入与退出或检查关键帧，确认方向、合拢／收回关系、接续和清理；不能用最终URL、标题可见或动画调用次数代替视觉验收。工具不可用时明确标为未验收，不宣称该门槛已通过。

页面回退运行 `sh scripts/design-checks/back-motion.sh`，综合动效行为运行 `sh scripts/design-checks/workspace-navigation.sh`，回退稳定性运行 `sh scripts/design-checks/back-stability.sh`。新增同类入口须扩展对应回归，不仅复用组件名称。

首选 CSS transition / keyframes；动态位置衔接使用原生 Web Animations API，零动画库。仅声明实际过渡属性，禁止 transition:all。常规运动使用 transform / opacity；现有开册层宽高插值是局部实现例外，需要实测性能，不能据此允许全站动画布局尺寸。

自动循环仅保留已确认的内容预览：书籍随机不重复抽取每本 6 秒、小票／网站预览周期 10 秒、词典缩略知识图谱与真实视频。均须按可见性与前后台暂停。头像彩蛋仅点击触发，不抢占作品操作；不新添全站待机装饰动画。

所有新 UI 动效支持 reduced-motion；键盘操作不等待空间动画。动态层不捕获无关输入，取消、重复触发、隐藏标签及失败路径必须恢复真实内容。既有实现的待核对项见文档入口，不能用规范替代测试结果。

## Do's and Don'ts

### Do

- **Do** 复用语义主题、共享控件及相邻 CSS Module。
- **Do** 同时交付进入与退出，按行为存在、状态正确、视觉连续三个门槛验收。
- **Do** 保留真实内容、原生链接、键盘焦点、上下文返回和媒体失败入口。
- **Do** 用可读文字与语义状态共同说明加载、空结果、失败和禁用。
- **Do** 更新对应规范并记录实际验证范围；源码核对、浏览器检查与用户认可分别表述。

### Don't

- **Don't** 恢复地铁、LED、全站菜单、侧栏或重复宣传说明。
- **Don't** 只做进入动效、以目标页淡入代替原页退场，或在退出完成前卸载离开中的内容。
- **Don't** 恢复手动加载灵感、预览开关、访客 JSON／同步信息或不存在的字段占位。
- **Don't** 用中文负字距、极淡正文、装饰投影或统一全高媒体井代替层级设计。
- **Don't** 将局部书籍造型、头像彩蛋或内容预览扩展成全站装饰规则。
- **Don't** 在现行标准末尾堆积互相覆盖的历史条目；更新正文，历史由 Git 保存。

搜索使用共享CollectionSearch：灵感搜标题、作者、原始标签及中文分类；布局搜编号、名称、主题及中文分类。输入即时更新q，保留现有分类；清除搜索只清q。原生作品链接携带q，详情相邻导航与返回记忆以分类、主题、关键词共同确定，不恢复已移除的放映台。
