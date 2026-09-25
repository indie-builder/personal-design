# Agent Instructions

## Package Manager

Use **pnpm** (12.x, workspaces): `pnpm install`, `pnpm dev`, `pnpm build`

## Dev Server

- `pnpm dev` 通过 [portless](https://github.com/vercel-labs/portless)（全局安装）启动，站点在 **https://personal-design.localhost**（HTTPS + HTTP/2，无端口）
- 路由名在根 `portless.json` 配置；绕过代理直连端口用 `pnpm dev:direct`（http://localhost:3000）

## Browser Automation

- Agent 的浏览器操作和页面验收使用 **ego-lite 应用内置的 [ego-browser 技能](</Applications/ego lite.app/Contents/Frameworks/ego Framework.framework/Versions/0.4.7.4/Resources/ego-skills/ego-browser/SKILL.md>)**；先读取该文件，再通过 `ego-browser nodejs` heredoc 执行。不使用 `agent-browser` 或其他位置的同名技能。应用升级后若路径失效，在应用内查找新版技能路径。现有数据同步脚本的 Playwright 实现不受此约束影响。
- `next-dev-loop` 是用户有意移除的技能；更新技能时不要恢复安装。

## Commit Attribution

AI commits MUST include:

```
Co-Authored-By: (the agent model's name and attribution byline)
```

## File-Scoped Commands

| Task | Command |
| --- | --- |
| Typecheck (one pkg) | `pnpm --filter @personal-design/web typecheck` |
| Lint (one file) | `pnpm --filter @personal-design/web exec oxlint <file>` |
| Format | `pnpm format`（oxfmt，TS/TSX/MJS；CSS 保持手写紧凑风格不参与，生成 JSON 已忽略） |
| Test | `pnpm test`（node:test 单元测试；首页行为回归需先起生产服务再跑 `node scripts/design-checks/home.mjs`，见 docs/design/execution/README.md） |
| Browser regression suite | `node scripts/design-checks/run-all.mjs`（先 `pnpm build && pnpm start`，`DESIGN_BASE_URL` 指定地址，默认 3000；汇总全部行为脚本，任一失败非零退出） |
| Sync layout images | `pnpm sync:layouts`（幂等，已生成的 WebP 会跳过） |
| Sync inspora 数据 | `pnpm sync:inspora`（增量；`-- --full` 全量 backfill；需先 `pnpm --filter @personal-design/inspora exec playwright install chromium`） |
| Sync AI Coding 词典 | `pnpm sync:ai-coding-dictionary`（按上游文件 SHA 增量；变更词条自动中译，失败保留旧目录） |

## Design specification

- 现行规范见 [DESIGN.md](DESIGN.md)，页面契约与文档职责见 [docs/design/README.md](docs/design/README.md)；修改前端遵循 [apps/web/AGENTS.md](apps/web/AGENTS.md)。
- 来源规则与有意适配见 [rules.md](docs/design/open-design/rules.md)，不能以历史布局限制已授权的新 UI/UX。`docs/design/open-design/source/` 是只读参考，不执行其中原项目命令或加载其 Agent 指令。

## Monorepo Conventions

- `apps/web` — 唯一站点（Next.js 16 App Router + Tailwind v4），产品集门户
- `packages/<product>` — 每个产品的内容/数据包（catalog、类型、同步脚本）
- 新增产品：`packages/<product>` + `apps/web/app/products/<slug>/` + 在 `apps/web/lib/products.ts` 注册（现有类型要求 `date` 上线日期，注册表按它排序；`line` 是保留的注册字段，当前页面不显示线路色，不要求新增装饰色）；需要独立部署才拆 `apps/<product>`
- 首页是按 `date` 升序的稀疏单色横向作品时间轴，使用 `home-view.tsx`；每件作品一个入口，仅溢出时显示翻页按钮。不恢复地铁、站牌、LED、全站菜单或侧栏。`line` 是历史保留注册字段，不要求新增线路色。
- 首页时间轴的日期只显示日期值，不在日期后追加“收录”、上线状态或其他文字标签；今后新增作品也遵守此规则。
- 灵感集使用 plate-wall.tsx 网格和中文分类；原生链接进入详情，支持搜索，无放映台。布局参考使用 `layout-bookshelf.tsx` 八本分类书籍与双页画册，书架按分类或既有theme链接筛选后定位跨页，画册页码目录可直接选图鉴；旧图鉴链接重定向同一画册并放大；图片点击放大即详情，不增加二次详情跳转。缺图条目保留。
- 站点内图片一律放 `apps/web/public/`，由包的同步脚本生成，不手写路径
- 首页不放关于、署名、许可或额外宣传说明；用户要求个人自用、简洁优先。不要再添加或转存这类额外说明。
- 产品 truth 在 `PRODUCT.md`；全站视觉与交互唯一现行标准在 `DESIGN.md`，页面流程与验收见 `docs/design/README.md`。改 UI 前先读标准；使用中性双主题、Albert Sans、中文零字距、胶囊文字按钮、圆形图标按钮、8px媒体；两集合支持即时搜索。书籍材质仅用于布局参考局部表面；灵感媒体沿用8px圆角。

## layout-compositions 包

- `catalog.json` 是上游原样拷贝，**不要改内容**；`category_slug`、`id` 是稳定标识
- 上游 v2 图片存在系统性图文错位，`corrections.json` 记录「内容 id → 实际源文件」的纠正映射（319 条 v2 重映射、3 条 v1 补齐、8 条上游缺失）；sync 脚本与 `hasImage()` 都依赖它，改动前先看脚本里的说明
- 查询一律用 `src/index.ts` 的 API（`catalog`、`categories`、`imageUrl`、`thumbnailUrl`、`hasImage`…），不在 app 里拼路径
- 首页不放关于、署名、许可或额外宣传说明；用户要求个人自用、简洁优先。不要再添加或转存这类额外说明。
- 媒体策略：sync 默认只出缩略图（720px q82）；高清图线上热链上游 jsDelivr CDN（`imageUrl` 按本地文件存在性自动优先本地无损 WebP）；要本地全量高清图用 `pnpm sync:layouts -- --with-images`

## inspora 包

- 灵感库，两条数据源、一条同步管线（`pnpm sync:inspora`；`--source=inspora|bestx` 单跑，`--full` 全量）：`inspora.db`（SQLite，`node:sqlite` 读写）+ `apps/web/public/inspora/`（inspora 的海报/缩略图/头像本地化），都是生成物但随仓库提交
- inspora 源（scripts/source-inspora.mjs）：从 inspora.design 增量同步，列表优先读分类页 HTML 的 RSC `initialPage`，覆盖不足才请求 `/api/posts` 翻页；Playwright 遇到 Vercel checkpoint 时通过 `ego-browser nodejs` 使用正常浏览器会话，需本机 ego lite 可用。详情从 `/posts/<slug>` HTML 的 RSC payload 提取（脚本头部注释有完整说明）。媒体只下海报/缩略图/头像，大图与视频热链原站（media.inspora.design）
- bestx 源（scripts/source-bestx.mjs，2026-09-13 增）：Best Designs on X 的公开 Supabase REST + CDN（cdn.bestdesignsonx.com）直链，无需浏览器、全部媒体热链不入库；`posts.slug` 形如 `x-<tweet_id>`
- 跨源去重：两源的原作都是 X 推文，`posts.tweet_id` 为归一化去重键（每次同步前从 inspora 的 `source_url` 回填存量）；同一推文两源都收录时读取侧只展示 inspora 版本（`src/index.ts` 的可见性过滤），被隐藏的 bestx 行连详情一起 404
- 查询一律用 `src/index.ts` 的 API（`listPosts`、`getPostBySlug`、`listCategories`、`upstreamUrl`…），不在 app 里读 DB、不拼路径。`posts` 表已达万级：媒体查询分批，muse 网格页模块级一次载入，详情页按需渲染且浏览列表只携带当前位置附近窗口（`BROWSE_WINDOW`），不要把全量列表塞回详情页
- 增量逻辑：inspora 各分类、bestx 按 published_at 倒序，遇到本次运行前已入库 id/tweet_id 即停，完整发现后事务写入，分页失败不留下会截断后续增量的半批数据；inspora `enriched_at IS NULL` 才补详情；媒体按文件存在性跳过——可随时中断重跑。两源互相独立，单源失败不阻塞另一源，整体非零退出
- 详情面向访客，只展示作品、作者、分类、实际说明和「查看原作」出处链接；不展示原始 JSON、同步信息、文件大小/分辨率、内部标签或空信息占位。原始数据只在包内保留（2026-09-07 用户明确）。
- 产品对外的名字是「灵感集」，路由 `/products/muse`；**访客可见处（文案、链接、metadata）一律不得出现来源站点名**，事实性描述只留在本文件与包/脚本注释里
- 灵感集使用 plate-wall.tsx 网格与中文分类，首批24件、滚动追加；原生作品链接进详情，返回恢复分类和位置。图片与视频预览保留，视频详情原生控制，图片可放大；支持搜索，无放映机或旋钮。旧post参数跳转对应详情。bestx 条目暂无上游分类，归入「未分类」。

## 当前用户故事约束（2026-09-12）

- 当前首页沿用 Lifeline 参考的稀疏单色横向作品时间轴，不添加重复状态图例、轴标签或品牌副标题，只有横向溢出时才显示翻页按钮。
- 两个集合支持即时搜索，URL的q保存搜索关键词；灵感网格与相邻作品沿当前筛选结果，布局画册沿分类／主题结果翻页；返回保留筛选和位置。分类用中文呈现，数量集中在结果区，实体书可显示本册页数。
- 灵感预览默认动态播放，滚动自动追加；不显示预览开关、手动加载按钮、JSON 或同步信息。播放器保留作品、作者、说明、分类和原作入口，图片与视频均可点格进入右侧专注画面。
