# Web frontend instructions

先读根 [AGENTS.md](../../AGENTS.md)，再按 [DESIGN.md](../../DESIGN.md) 与 [页面契约](../../docs/design/README.md) 修改；页面规格不在此重复。视觉数值与获准例外以 DESIGN.md 为准，来源文件及历史报告不覆盖现行标准。

## 实现

- 优先复用 `components/` 的控件，缺失时本地小范围补齐；不引用不存在的 `@open-design/components`。产品布局留在 App，通用控件职责小，链接、内容标签和特殊控件保留原生 HTML 语义。
- 全局 CSS 仅放 tokens、reset、基础排印与明确共享布局；组件专属样式归相邻 `*.module.css`，已有 Tailwind 工具类可沿用。CSS 保持紧凑单行手写风格，不手工展开；拆分保留级联顺序，不把机械搬移混入视觉／行为变更。
- 中文标题字距为 0，多行标题不继承 Latin 紧行高。站点自有动效不新增通用动画库，词典保留原版运行资源；键盘、reduced-motion 与焦点回归不能省略。
- 灵感网格页模块级一次载入；详情按需渲染，相邻浏览仅携带 `BROWSE_WINDOW` 附近窗口，不传全量列表。
- 访客界面不展示原始 JSON、同步信息、内部字段或空信息占位；灵感集文案、链接、metadata 不出现来源站点名。首页不添加或转存关于、署名、许可及额外宣传说明。
- 按真实数据覆盖加载、空、错误、有内容、极端内容，不虚构账户、支付、客服等功能。

## 验收

- 检查命令见根 AGENTS.md；类型检查使用 TS7 原生 `tsc`，lint 规则见 `.oxlintrc.json`，不能将 lint 通过当作交互无障碍验收。
- 按改动范围运行类型检查、相关文件 lint 和适用的已有测试；涉及路由或页面渲染时执行生产构建。浏览器检查遵循根指引及 [验收要求](../../docs/design/README.md#修改后的验收要求)，重点覆盖 1280 / 1440px 桌面、双主题、键盘与减少动态效果；小屏保证已有内容和操作不被裁切，各产品获准例外以现行标准为准。
- 进入、退出和高频反馈分别处理。按 DESIGN.md 的成对动效规则验证：站内返回必须原页面先退场再切换，不能以目标页入场替代；新增返回／关闭入口同步扩展回归。
- 分别报告行为、状态和视觉验收结果，站内返回与浏览器原生后退分别记录；缺少视觉证据不得声称全部通过。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
