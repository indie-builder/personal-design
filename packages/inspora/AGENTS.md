# 灵感数据包

- 对外名称「灵感集」，路由 `/products/muse`。访客文案、链接与 metadata 不出现来源站点名；来源事实仅保留在包内与脚本注释。原始 JSON 留在包内，页面只展示真实作品信息及原作入口，详见 [页面契约](../../docs/design/README.md)。
- `inspora.db` 使用 `node:sqlite`；它与 `apps/web/public/inspora/` 均为生成物，随仓库提交。
- 读取统一用 [src/index.ts](src/index.ts) 的 `listPosts`、`getPostBySlug`、`listCategories`、`upstreamUrl` 等 API，不在 App 读 DB 或拼路径。媒体查询须分批。

## 同步约束

- 根目录运行 `pnpm sync:inspora` 增量同步；追加 `-- --full` 全量，`-- --source=inspora` 或 `-- --source=bestx` 单跑。inspora 源需先执行 `pnpm --filter @personal-design/inspora exec playwright install chromium`。
- [source-inspora.mjs](scripts/source-inspora.mjs)：列表优先分类 HTML 的 RSC `initialPage`，不足才用 `/api/posts`；详情读 RSC payload。Playwright 遇 Vercel checkpoint 回退 ego-browser 正常会话，需本机 ego lite。仅本地化海报／缩略图／头像，大图与视频热链原站。
- [source-bestx.mjs](scripts/source-bestx.mjs)：公开 Supabase REST + CDN，无需浏览器，媒体全部热链；slug 为 `x-<tweet_id>`，无分类条目归「未分类」。
- `tweet_id` 是跨源去重键，每次同步前从 inspora 的 `source_url` 回填；重复推文读取侧只展示 inspora 版本，被隐藏的 bestx 详情也必须 404。
- inspora 各分类、bestx 均按 `published_at` 倒序，遇本次运行前已入库的 id/tweet_id 停止；完整发现后事务写入，分页失败不得留下会截断下次增量的半批数据。
- 仅对 `enriched_at IS NULL` 的 inspora 行补详情；媒体按文件存在性跳过，可中断重跑。两源独立，单源失败不阻塞另一源，整体非零退出。管线见 [sync.mjs](scripts/sync.mjs)。
