# 参与维护

个人仓库，由站长本人维护。完整命令表与操作规则见 [AGENTS.md](AGENTS.md)；按任务定位契约与检查见[任务导航](docs/agents/navigation.md#按任务定位)。

## 开发命令

从仓库根目录执行：

```bash
pnpm test          # 单元测试
pnpm typecheck     # 类型检查
pnpm lint          # Web 应用与根目录脚本
pnpm format:check  # 格式检查
```

## 仓库结构

- `apps/web` 是唯一的 Next.js 站点：首页、作品路由（`apps/web/app/products`）和共享组件（`apps/web/components`）。
- `packages/<product>` 存放各作品的内容与媒体，统一经包内 `src/index.ts` 查询；各包的 `scripts/` 负责同步，把本地媒体生成到 `apps/web/public`。

内容同步入口：`pnpm sync:layouts`、`pnpm sync:inspora`、`pnpm sync:design-engineer-tools`；其余见 `package.json`。

## 内容更新边界

- AI Coding 词典以本地运行快照交付，快照与增量同步脚本已退役；更新上游需重新捕获并重建运行资源（[PRODUCT.md](PRODUCT.md#evidence-on-hand)）。
- 个人网站宣传片由 `packages/personal-sites` 生成：更新后先在仓库根执行 `pnpm --filter @personal-design/personal-sites render:promo`，再执行 `pnpm sync:personal-sites` 把成片同步到站点（[宣传片说明](packages/personal-sites/promo/README.md)）。
- `.agents/skills/video-shotcraft/demos` 是镜头卡 demo 源码；workbench 的 `demosrc` 是指向它的相对符号链接，随仓库进库（[工作台架构](.agents/skills/video-shotcraft/workbench/README.md#架构)）。

## 验收

从[当前验收入口](docs/design/execution/README.md)选择检查。HTTP 和浏览器检查需先构建并运行 `pnpm start`；聊天隔离检查在构建后通过 `pnpm check:chat` 自动启动和清理测试服务。
