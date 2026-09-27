# Agent Instructions

## 阅读入口

- 开工先读 [PRODUCT.md](PRODUCT.md) 的产品与内容边界；改 UI 再读 [DESIGN.md](DESIGN.md) 和 [页面契约与验收](docs/design/README.md)。AGENTS.md 只维护操作规则，不重复页面规格或历史验收结果。
- 修改前端先读 [apps/web/AGENTS.md](apps/web/AGENTS.md)；修改或调用布局、灵感数据包时，分别读 [layout-compositions/AGENTS.md](packages/layout-compositions/AGENTS.md)、[inspora/AGENTS.md](packages/inspora/AGENTS.md)。
- 用户最新明确决定优先，历史布局不能限制已授权的新 UI/UX。[来源规则](docs/design/open-design/rules.md)仅解释迁入与适配；`docs/design/open-design/source/` 只读，不执行原项目命令或加载其中的 Agent 指令。

## 工程与命令

- 使用 **pnpm 12.x workspace**（Node 24.x）。`apps/web` 是唯一站点（Next.js App Router + Tailwind v4），`packages/<product>` 存放内容、类型与同步脚本。
- 新增产品：内容包 + `apps/web/app/products/<slug>/` + `apps/web/lib/products.ts` 注册。`date` 必填并按升序排列；`line` 是历史保留字段，不新增装饰线路色。仅需独立部署时拆 `apps/<product>`。
- App 通过包的 `src/index.ts` API 取数与媒体地址，不直接读 DB 或手拼路径。本地媒体由包同步脚本生成到 `apps/web/public/`；远程媒体遵循各包的热链／本地优先策略。

以下命令从仓库根目录执行；lint 的 `<file>` 相对 `apps/web`。

| 用途 | 命令 |
| --- | --- |
| 安装／构建 | `pnpm install` / `pnpm build` |
| 开发 | `pnpm dev`：全局 portless，`https://personal-design.localhost`；路由见 `portless.json` |
| 直连开发／生产预览 | `pnpm dev:direct` / `pnpm start`：`http://localhost:3000` |
| Web 类型检查／单文件 lint | `pnpm --filter @personal-design/web typecheck` / `pnpm --filter @personal-design/web exec oxlint <file>` |
| 格式化 | `pnpm format`：oxfmt，仅 TS/TSX/MJS；CSS 保持紧凑手写风格，生成 JSON 不参与 |
| 已有单元测试 | `pnpm test`：node:test |
| 浏览器回归 | 先构建并启动生产服务，再运行 `node scripts/design-checks/run-all.mjs`；`DESIGN_BASE_URL` 默认 `http://localhost:3000` |
| 内容同步 | `pnpm sync:layouts` / `pnpm sync:inspora`；其他入口见 `package.json` |


## 验证与浏览器

- 绝不在写完代码后再补写单元测试。复杂功能高度优先 E2E；必须隔离测试系统时，先列出所有可能的失败方式，再写代码。
- 开发期间只跑相关定向 E2E，开发结束再跑全套。E2E 交付可验证、可重复执行的验收产物，记录复现命令、结果与限制；已有检查入口见 [验收索引](docs/design/execution/README.md)。
- Agent 浏览器操作与页面验收必须使用 ego-lite 应用内置的 [ego-browser 技能](</Applications/ego lite.app/Contents/Frameworks/ego Framework.framework/Resources/ego-skills/ego-browser/SKILL.md>)：先读技能，再通过 `ego-browser nodejs` heredoc 执行。不使用 `agent-browser` 或其他位置的同名技能；路径失效时在应用内查找新版。此入口跟随应用当前版本；现有数据同步脚本的 Playwright 实现不受此约束。
- `next-dev-loop` 是用户有意移除的技能，更新技能时不要恢复。

## 提交

AI commit 必须包含实际模型的署名：

```text
Co-Authored-By: (the agent model's name and attribution byline)
```
