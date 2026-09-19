# G2 · 首页时间轴

状态：实现完成；类型检查、文件 lint 与专项浏览器行为检查已通过；最终视觉验收纳入主任务截图批次。

## 范围与结果

- `/`、HomeView、LifelineTimeline / LifelineNode 及两个相邻 CSS Modules。沿用真实产品注册表，渲染时按上线日期稳定排序；不改数据包与生成物。
- 首页以日期轨道、媒体封面、20px 产品标题、正文说明和显式产品入口组成连续工作台。关于节点承载介绍与来自 upstream 常量的署名、许可链接；未来节点保持非交互规划状态，不制造死按钮。
- 工具栏提供操作提示、当前位置、前后节点按钮；边界明确 disabled。移动端提示切换为左右滑动。
- 桌面滚轮与触控板（含 line/page deltaMode）映射横向 rAF 平滑滚动。节点内容较高时优先纵滚，边界再交给横轴；轨道尽头允许页面继续滚动。Ctrl+wheel 保持浏览器缩放。
- 鼠标拖动超过 6px 才捕获指针；跨边界继续拖动，释放可惯性移动；click 抑制限定于真实拖动结束后 250ms，键盘 click 不受影响。取消手势不加惯性。
- 统一使用原生 scrollLeft 作为状态源，消除旧实现 transform 与原生横滑切换时的坐标冲突。方向键切节点，Home / End 至边界，不抢占输入元素或组合键。焦点进入屏外节点立即完整展示。
- 触摸使用浏览器原生滚动与 proximity snap；窄屏自然纵向流动，避免锁死纵滚。reduced-motion 取消平滑与惯性动画，操作仍完整。

## 状态覆盖

| 状态 | 实现 |
| --- | --- |
| 有内容 | 真实图片、名称、描述、计数与注册表入口；日期排序 |
| 加载 | next/image 保留固定 4:3 空间，第一张优先加载；页面本身为同步静态数据，无人为加载流程 |
| 空 | 空产品数组不再 reduce 报错，明确整理中提示，关于与未来节点仍可浏览 |
| 错误 | 封面 onError 显示具名失败说明；产品入口仍可使用 |
| 极端内容 | 标题及描述换行、统计 wrap、桌面节点独立纵滚、手机自然高度；无统计时不渲染空列表 |
| 操作状态 | 原生链接语义与共享 Button；hover / active / focus，前后边界 disabled；drag cancel、click suppression、reduced-motion |

## 规范依据与适配

遵循 OpenDesign `rules.md` 的中性语义角色、中文 tracking 0 / 标题 1.35、正文 14px / 1.75、辅助 12px、12px 卡片圆角。页面使用父级 `--workspace-height`，删除首页额外 `h-dvh`。产品颜色仅用于有语义的线路编号。普通入口及图标控件复用共享 Button。

签名手势继续零动画库 rAF；平滑按帧时差归一化，拖动自身直接跟手。移除装饰性轨道入场和节点级联，将运动集中在实际浏览反馈。新的进度点在固定视口底部，不与原生滚动内容一起移出。

所有组件样式归属 CSS Modules。主任务可删除旧 `.lifeline-rail` / `.rail-planned` / `.lifeline-node`、其入场 keyframes、`.timeline-caption` 及相关覆写；不要删除其他任务尚在使用的 marquee / detail / lightbox 样式。

## 验证

- `pnpm --filter @personal-design/web typecheck`：通过。
- `pnpm --filter @personal-design/web exec eslint app/page.tsx components/home-view.tsx components/lifeline/timeline.tsx`：通过。
- `scripts/design-checks/home.mjs` 在主任务恢复本地服务器后执行成功（Playwright Chromium，无截图）：1440×900 首页轨道 viewport 1184px / 内容 1696px；下一节点由 0 移至 410px；End 到尾端且下一节点禁用；Home 后鼠标拖动实际移动且 URL 保持首页；滚轮移动至 448px；reduced-motion End 即时到 512px 末端。
- 390×844：文档 clientWidth / scrollWidth 均为 390px，没有全页横溢出；时间轴内容保持独立横滑（1400px），节点自然高度。
- 拦截所有 Next Image 请求后重新加载：两个封面均呈现“封面暂时无法显示”，入口保持可用。整个行为检查捕获的 pageerror 为零。
- 初次服务器超时仅属测试环境阻塞，已由主任务恢复后重新完成上述检查。
- 全站桌面/手机/双主题截图及集成流程由主任务统一采集；此处未额外运行截图打磨循环。

## 可复现检查

执行 `node scripts/design-checks/home.mjs`；可设置 `DESIGN_BASE_URL`（默认 `http://localhost:3000`）。脚本通过项目的 `playwright` 依赖运行，将断言结果写入 `docs/design/execution/evidence/home-behavior.json`，不采集截图。脚本从日志观察升级为失败即退出的断言；首次严格复跑发现部分帧率下 End 会在末端前 3px 停滞。经主任务授权，rAF 改为保存内部小数坐标，不再把浏览器取整后的 scrollLeft 作为下一帧积分值；复跑全部断言通过，End 精确到 512px，下一节点禁用。修改后的 timeline 文件 lint 通过。

## 2026-09-19 更正

首页几经迭代（时间轴漫步者、文案与按钮调整），上文「验证」「可复现检查」描述的脚本行为已过时。`scripts/design-checks/home.mjs` 已重写对齐现行契约：翻页步长必须等于作品条目宽（守护漫步者不得缩小步长的回归）、方向键一步一列、拖动实质移动且停留在首页、reduced-motion 即时到位、窄屏无页面级横溢；原生 End/Home 与垂直滚轮不再断言（现代 Chromium 无对应默认行为，且非应用契约）；封面失败仅拦截图片优化通道做无页面错误冒烟。上文历史数值（410px、512px、「封面暂时无法显示」×2 等）仅描述当时版本。
