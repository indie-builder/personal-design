# 灵感数据包

- 对外名称「灵感集」，路由 `/products/muse`。访客文案、链接与 metadata 不出现来源站点名；来源事实仅保留在包内与脚本注释。原始 JSON 留在包内，页面只展示真实作品信息及原作入口，详见 [页面契约](../../docs/design/README.md)。
- `inspora.db` 使用 `node:sqlite`；它与 `apps/web/public/inspora/` 均为生成物，随仓库提交。
- 读取统一用 [src/index.ts](src/index.ts) 的 `listPosts`、`getPostBySlug`、媒体 `previewSrc` 等 API，不在 App 读 DB 或拼路径。媒体查询须分批。

## 同步约束

- 根目录运行 `pnpm sync:inspora` 增量同步；追加 `-- --full` 全量，`-- --source=inspora`、`-- --source=bestx` 或 `-- --source=collectui` 单跑。inspora 源需先执行 `pnpm --filter @personal-design/inspora exec playwright install chromium`。
- [source-inspora.ts](scripts/source-inspora.ts)：列表优先分类 HTML 的 RSC `initialPage`，不足才用 `/api/posts`；详情读 RSC payload。Playwright 遇 Vercel checkpoint 回退 ego-browser 正常会话，需本机 ego lite。仅本地化海报／缩略图／头像，大图与视频热链原站。
- [source-bestx.ts](scripts/source-bestx.ts)：公开 Supabase REST + CDN，无需浏览器，媒体全部热链；slug 为 `x-<tweet_id>`，无分类条目归「未分类」。
- Collect UI 复用 [source-bestx.ts](scripts/source-bestx.ts) 的 REST 管线，按站点 `created_at,id` 倒序；同一原作多行媒体合并并按 `media_index` 排序，slug 为 `c-<tweet_id>`，分类标签保留为搜索关键词。视频的 MP4 缩略片不能作图片封面。
- `tweet_id` 是跨源去重键，每次同步前从 inspora 的 `source_url` 回填；重复原作依次保留 inspora、bestx、collectui，同源重复按 id 保留一份。列表、详情、导航与分类计数共用去重条件，被隐藏的详情必须 404。
- 各源按各自站点排序，遇本次运行前已入库的 id/tweet_id 停止；完整发现后事务写入，分页失败不得留下会截断下次增量的半批数据。上游旧记录更新用 `--full` 刷新。
- 仅对 `enriched_at IS NULL` 的 inspora 行补详情；媒体按文件存在性跳过，可中断重跑。三源独立，单源失败不阻塞其他源，整体非零退出。管线见 [sync.ts](scripts/sync.ts)。
