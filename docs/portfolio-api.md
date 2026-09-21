# 原生作品集公开读取接口

接口与 Web 共用各内容包的查询 API，不另建内容副本。仅支持 GET；媒体返回绝对地址，线上沿用当前站点或既有 CDN。响应缓存为 public/max-age=60/stale-while-revalidate=300。

| 路径 | 内容 |
| --- | --- |
| `/api/portfolio` | `items`：作品索引，日期、名称、简介、封面 |
| `/api/portfolio/layouts` | 图鉴分页，8 类分类和主题；沿用 corrections 修正图源 |
| `/api/portfolio/layouts/:id` | 单个图鉴，缺图仍保留元数据与空 media |
| `/api/portfolio/muse` | 已去重的灵感分页、中文分类 |
| `/api/portfolio/muse/:slug` | 公开标题、作者、说明、全部图片/视频、原作 URL |
| `/api/portfolio/tools` | 分类、工具名称、官网 URL 与图标 |
| `/api/portfolio/site` | 个人网站说明、宣传片、海报、原站地址 |

集合参数：`offset` 默认 0，`limit` 默认 24、范围 1–60，`q` 最长 200 字，`cat` 为返回的分类 id。布局另支持 `theme`（主题 id）。集合响应含 `items,total,hasMore,categories,topics,attribution`；详情响应为 `{item}`。无效分页为 400，未知资源为 404。内部 raw、同步信息、媒体大小等不进入响应。

本地启动：`pnpm --filter @personal-design/web exec next dev --hostname 127.0.0.1 --port 7200`。

接口回归：服务启动后 `pnpm test:portfolio-api`；用 `PORTFOLIO_API_BASE` 覆盖测试地址。常规 `pnpm test` 不依赖运行中的 HTTP 服务。

上线需部署本项目的新版本；iOS Release 默认连接 `https://portfolio.default-coder.lovemyrmb.cn/`。本地 Debug 可用 `PORTFOLIO_BASE_URL=http://127.0.0.1:7200/` 联调，生产包不会读取该覆盖值。
