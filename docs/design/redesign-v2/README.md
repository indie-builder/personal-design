# V2 全站 UI / UX 交付索引

用户要求整体重新设计，并明确首页承担菜单、不要全站菜单。旧全站交付报告只记录历史，不证明本轮结果。

> **状态（2026-09-27）**：本轮属历史交付记录。其验收脚本已由现行套件取代并被移除：
> `v2-foundation`、`v2-home`、`v2-muse`、`v2-layouts`、`v2-muse-video-viewport`、`v2-capture`
> 在移除前对当前生产构建逐一运行即失败（断言的是旧版页面结构与命名），不再可复现。
> 现行行为的回归以 `node scripts/design-checks/run-all.mjs` 为准；
> 仍可运行的 `v2-muse-spinner.mjs` 保留作诊断。下文对本轮脚本的引用按历史记录阅读。

## 方案与覆盖

- [完整目标](../../goals/ui-ux-redesign-v2.md)
- [体验、页面与共享契约](contract.md)
- [改版前后用户任务对照](before-after.md)
- [执行台账](ledger.md)
- [基础入口与共享操作](foundation.md)、[首页](home.md)、[灵感集](muse.md)、[布局参考](layouts.md)
- [独立视觉与UX复核](finish-review.md)：完整评审后的三项修正全部关闭，最终修正评分ship；范围与限制见报告。

## 本轮可复现证据

所有脚本在仓库根运行，支持 `DESIGN_BASE_URL`，默认 `http://localhost:3000`。生产预览：`pnpm build` 后执行 `pnpm --filter @personal-design/web start --port 3001`；测试时加 `DESIGN_BASE_URL=http://localhost:3001`。新机器使用 `pnpm exec playwright install chromium` 准备浏览器。

| 范围 | 脚本 | 已取得证据 |
| --- | --- | --- |
| 全局与无菜单、主题、焦点、窄屏 | `scripts/design-checks/v2-foundation.mjs` | [18项](evidence/foundation.json) |
| 首页两个入口及媒体失败 | `scripts/design-checks/v2-home.mjs` | [结果](evidence/home.json)、[生产日志](evidence/home-production.log) |
| 灵感直接详情/返回现场/播放/来源/JSON/超时 | `scripts/design-checks/v2-muse.mjs` | [生产日志](evidence/muse-production.log)及模块报告 |
| 图鉴350条、主题/搜索、缺图、触摸、放大 | `scripts/design-checks/v2-layouts.mjs` | [16场景](evidence/layouts.json)、[生产日志](evidence/layouts-production.log) |
| 首页出发的两条完整旅程 | `scripts/design-checks/v2-journeys.mjs` | [结果](evidence/journeys.json) |
| 视频控制首屏可达、滚动稳定 | `scripts/design-checks/v2-muse-video-viewport.mjs` | [三尺寸几何结果](evidence/video-viewport.json) |
| 全部可访问静态路由 | `scripts/design-checks/v2-routes.mjs` | [509条HTTP+主内容](evidence/routes.json) |
| 视觉捕获 | `scripts/design-checks/v2-capture.mjs` | [截图索引](evidence/captures.json)；本机图片 `.impeccable/review/redesign-v2/` |
| 原始规范保持 | SHA256核对manifest | [25份原文](evidence/source-integrity.json) |

截图覆盖7种页面/内容模板的1440×900、1024×768、390×844，另6张暗色与视频下方信息区3张。列表截首屏，图片详情截全文；视频以固定视口和下方实际滚动视图呈现，避免瞬态原生播放器状态混入完整页面捕获。原始视频帧曾单独核对，无修改或覆盖内容。

生产类型检查、全站lint及构建通过，构建510个条目（508个真实内容页、404、框架内部global-error）。HTTP测试509个可访问条目；内部错误模板不伪装为正常产品路由。

## 限制与边界

- Chromium含模拟触摸，未宣称真实iOS/Android或所有引擎通过。720px是1440px在200%下的等效CSS重排宽度，不是浏览器缩放按钮测试。
- 全量HTTP通过不等于505件内容逐一视觉验收。模板的图片、视频、多媒体、长标题、缺图、首尾、筛选与异常状态分别由脚本和模块报告覆盖。
- 大图与视频依赖第三方服务。验证了有界加载、失败恢复和原始资源入口，不保证外站永远可用；8件真实缺图未伪造补图。
- 不存在于当前数据的空产品/缺作者等分支明确为代码审阅，不改内容包制造测试记录。
- 保存本轮基线，保留已有未提交工作。未提交、推送或部署。最终用户审美认可不会由自动化测试或独立评审代为宣称。
