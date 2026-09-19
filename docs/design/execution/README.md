# 全站设计交付证据

2026-09-05。依据 OpenDesign 原始规则完成全站实现；用户产品事实和数据包保持。原文快照位于 `../open-design/source/`，25份文件哈希无变化。

## 验收索引

| 范围 | 实现与状态报告 | 可复现检查 |
| --- | --- | --- |
| 基础控件、主题、导航、重排 | [foundation.md](foundation.md) | `node scripts/verify-design.mjs`；[17项生产断言](evidence/foundation.json) |
| 首页时间轴翻页步长、方向键、拖动、减少动态效果、窄屏（封面失败为冒烟） | [home.md](home.md) | `node scripts/design-checks/home.mjs`；[结果](evidence/home-behavior.json) |
| 灵感检索、URL/返回、媒体轮播、超时恢复 | [muse.md](muse.md) | `node scripts/design-checks/muse-behavior.mjs` 与 `muse-recovery.mjs` |
| 布局书架与画册：翻页步长、页码目录、放大即详情、缺图、高清降级、旧链接与 404 | [layouts.md](layouts.md) | `node scripts/design-checks/layouts-check.mjs` 与 `layouts-states.mjs`；[列表](evidence/layouts-check.json)、[状态](evidence/layouts-states.json) |
| 灯箱滚动锁/焦点/组内翻图、自动播放、404 | [shared.md](shared.md) | `node scripts/design-checks/shared-browser.cjs` 与 `shared-autoplay.cjs` |
| 两条从首页出发的完整浏览路径 | [生产结果](evidence/journeys.json) | `node scripts/design-checks/journeys.mjs` |
| 全量静态路由 | [路由结果](evidence/routes.json) | `node scripts/verify-design-routes.mjs` |
| 视觉与原规则独立复核 | [finish-review.md](finish-review.md) | ship；初轮发现与修复已关闭 |
| 来源完整性 | [source-integrity.json](evidence/source-integrity.json) | 25份来源快照哈希一致 |

所有浏览器脚本支持 `DESIGN_BASE_URL`，默认 `http://localhost:3000`。生产预览执行 `pnpm build`、`pnpm --filter @personal-design/web start --port 3001`，然后以 `DESIGN_BASE_URL=http://localhost:3001` 运行脚本。Playwright 在根开发依赖中；新机器需 `pnpm exec playwright install chromium`。

## 视觉证据与检查范围

截图索引：[captures.json](evidence/captures.json)。图片在仓库本机 `.impeccable/review/full-design/`，由 `node scripts/capture-design.mjs` 生成。首页、灵感列表、布局列表、两个详情模板、404分别覆盖1440×900、1024×768、390×844；另有5张暗色截图。媒体正常态等待实际图片加载，错误/超时态由行为脚本明确注入。

一轮集中检查和一轮确认完成；修正搜索占位符/边框对比度、首次主题事件竞争、首页/404主内容landmark、时间轴整数滚动导致终点前停滞。独立视觉复核无剩余实质问题。

最终 typecheck、全站 ESLint（零warning）、生产构建通过。构建510个静态条目：508个产品/内容页面、404与框架内部global-error。HTTP检查覆盖509个可访问条目（508个200与1个404）；框架内部global-error不当作用户路由。全部返回预期状态并具有主内容标记。全量路由检查不等于逐条内容的视觉检查；模板变体见各模块报告。

## 实际限制

- Chromium自动化覆盖桌面、模拟触摸及reduced-motion；未宣称真实iOS/Android设备或所有浏览器引擎验收。720px为1440px在200%下的等效CSS布局宽度重排检查，不冒充真实浏览器缩放操作。
- 外部高清图和视频依赖来源服务；已验证有界超时、重试/缩略图降级与原媒体入口，不保证第三方始终可用。8张上游缺图保持真实缺图状态。
- 数据中不存在的缺作者/空产品等分支以代码审阅覆盖，未修改数据制造成功证据。
- 既有未提交改动已保存执行基线，内容包未改动；本次未提交、推送或部署。
