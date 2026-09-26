# 布局数据包

- `catalog.json` 是上游原样拷贝，不改内容；`category_slug`、`id` 是稳定标识。
- 上游图片存在系统性图文错位，`corrections.json` 是「内容 id → 实际源文件」映射，包含 v2 重映射、v1 补齐及缺图。修改前读 [同步脚本](scripts/sync.mjs) 的说明，同时核对 [查询 API](src/index.ts) 的 `hasImage()`；保留缺图条目。
- 查询和媒体地址统一用 `src/index.ts` 的 `catalog`、`categories`、`imageUrl`、`thumbnailUrl`、`hasImage` 等 API。
- 根目录执行 `pnpm sync:layouts`，默认只生成 720px / q82 缩略图，已有 WebP 跳过。高清图默认热链 jsDelivr，`imageUrl` 优先已有本地无损 WebP；需要全量本地高清图时执行 `pnpm sync:layouts -- --with-images`。
