# G4 布局参考

状态：实现、文件级 lint 与23 项浏览器断言通过；截图与全站集成由主任务统一采集。

## 范围与来源

- 列表 `/products/layout-compositions`、全部分类和无效分类恢复、双向浏览、图鉴灯箱入口。
- 350 个静态详情参数、分类返回、高清资源、同主题前后项与相关推荐；所有数据查询仍经内容包 API。
- 只改 layout-compositions 路由、LayoutWall、DetailTools、相邻 CSS Modules；没有修改 catalog、corrections、图片生成物。
- 对齐 rules.md 中 tokens/base 的实色中性表面与正文角色；控件复用 Button（4px、主操作胶囊），内容 12px、面板 16px，中文标题 26px/1.35、字距 0，说明文字 12px/1.75。
- 卡片边界反馈用共享 150ms token；详情去掉非必要整页入场。所有专属布局和图片状态样式归属 CSS Modules，无 `.layout-page`、`.layout-detail`、`.detail-in`、`.lifeline-marquee`、`.layout-wall-card` 全局依赖。

## 实现与状态

| 表面/操作 | 覆盖 |
| --- | --- |
| 列表有内容 | 342 张可用图鉴、分类计数按真实可用图计算；卡片明确编号与名称。缺图不生成空按钮。 |
| 分类与 URL | 保留现有 replace 历史语义；分类切换重挂载两行。未知 `cat` 保留上下文、说明未找到、清除恢复全部；详情链接修复为编码分类名而非不可匹配 slug。 |
| 双行浏览 | 原生横向滚动区域，rAF 25px/s、上下行相反初始方向、到边界反向；保留零动画库。没有复制卡片，全部原始卡片均可键盘聚焦与横滑到达。 |
| 暂停 | 显式暂停按钮保存 localStorage；悬停、区域焦点、指针按下、灯箱、后台页暂停。切分类保留用户暂停选择。 |
| 触摸 / reduced motion | 停止自动位移并隐藏不适用自动控制；显示手动浏览提示、保留原生横滑和全部卡片。 |
| 媒体加载 / 失败 | 详情先展示本地缩略图；高清成功替换，失败或 12 秒超时保留预览及可理解提示；可放大重试，由共享灯箱处理完整状态。 |
| 缺图详情 | 保留编号和内容信息，显示缺图提示，不渲染放大/高清资源假入口；相邻项与分类返回仍可用。 |
| 高清资源 | 同源本地路径用原生 download；外部高清图用“打开高清原图”新标签页链接并说明可用浏览器保存，避免跨域 download 无效的承诺。 |
| 相邻内容 | 同二级主题范围；首尾显示边界说明，缺图项仍可导航；相关推荐保留编号与名称。 |
| 键盘 | 普通详情页面左右方向键翻页；输入、可编辑区、button/link、tabs/sliders、局部忽略区域、灯箱、组合键及长按不抢占；sessionStorage 不可用不阻断导航。 |
| 操作状态 | 原生按钮/链接，焦点 2px、hover 边框反馈，按下 1px 位移；reduced motion 禁用位移。 |
| 同步数据 | 无人为数据 loading；列表 Suspense 提供简短加载状态。数据不含远端运行时 API 错误。 |

## 已有证据

- `pnpm --filter @personal-design/web exec eslint components/layout-wall.tsx components/detail-tools.tsx app/products/layout-compositions/page.tsx 'app/products/layout-compositions/[id]/page.tsx'`：通过。
- 只读数据变体审计：350 条、342 可用、33 二级主题；缺图 ID `063,117,118,119,120,121,122,123`；首个主题边界 `001/015`、第二 `016/030`；最长名称样例 `342`。
- 浏览器、全站 typecheck/build 和截图的最终结论由主任务集成记录；此处不将静态审查当作浏览器验证。

## 浏览器验证（2026-09-05）

本地 `http://localhost:3000`，Playwright Chromium，真实页面和数据，导航采用 domcontentloaded 避免外部媒体阻塞。第一批 15 项通过：

- 1440×900：两行包含且只包含 342 个原始卡片；实际 scrollLeft 一增一减；暂停冻结两行，刷新记忆保留。
- 未知分类出现恢复状态；点击全部后清除 cat；001 第一张边界正确；高清外链 target=_blank 且没有无效 download；分类返回 URL 为可匹配的“构图逻辑”。
- 063 缺图提示可见且没有高清资源入口。
- 390×844、触屏并启用 reduced-motion：全部 342 张仍存在，聚焦第一行最后一张后真实横滚到达；整页没有意外横向溢出；最长标题样例 342 详情同样无溢出。

截图/视觉精查仍由主任务统一记录，不把以上 DOM/几何断言称为完整视觉验收。

第二批 8 项通过（1024×768）：拦截并挂起远端高清请求，12 秒后切换缩略图失败提示；链接聚焦时 ArrowRight 不翻页，body 聚焦时 ArrowRight 从 001 到 002，浏览器后退回 001；015 显示末张边界；悬停和焦点分别冻结首行；深色主题无整页横向溢出。该批首次等待误用了 load（测试主动挂起图像），改为 domcontentloaded 后全部通过，不是页面导航缺陷。

最终文件级 lint（包括 tuple 类型修复和推荐文本排印调整后）通过。布局专属验收共 23 项浏览器断言；全站类型检查、构建和视觉截图仍由主任务汇总。

## 可复现脚本

> 2026-09-19 更正：上文的图鉴墙验收针对已移除的旧 UI，两个脚本已重写对齐
> 现行书架＋画册契约（见 `docs/design/README.md`），证据文件路径不变。
> 本节以下为重写后的现状，历史验收记录保留在上方供追溯。

在仓库根目录运行（先启动站点，并安装 Playwright Chromium）：

```sh
node scripts/design-checks/layouts-check.mjs
node scripts/design-checks/layouts-states.mjs
```

`layouts-check.mjs` 覆盖书架＋画册行为：八本书架、开册写入 URL、单跨页翻页步长、
首末边界禁用、页码目录直接定位、图片点击放大即详情且 Esc 分层退出（焦点回书页再回书脊）、
翻入页必须预取（守护翻页不闪现）、搜索命中缺图条目定位单页画册、无效 cat 回书架、
390px 无横向溢出。`layouts-states.mjs` 覆盖状态与兼容：旧缺图链接定位书页不弹放大、
未知编号经 proxy 前置判定返回真 404（cacheComponents 流式响应无法改状态码）、
高清挂起时缩略图兜底并可重试恢复、
直达地址不重播抽书、reduced-motion 下 Esc 即时返回。

两者从 `playwright` 包导入，读取 `DESIGN_BASE_URL`（默认 `http://localhost:3000`）。
证据输出 `docs/design/execution/evidence/layouts-check.json` 和 `layouts-states.json`，
保留断言结果与失败原因，失败时关闭浏览器。
