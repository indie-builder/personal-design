# 内容同步 loop

## Outcome

四个内容包的本地快照与上游保持同步，每次同步都有增量数字与去重结果可查，且不把上游变动误当成本站改动。

## Trigger

- **Schedule**：每日一次。
- **Event（优先）**：上游 catalog 变动，或用户要求同步某个包。
- 上游静止时不唤醒（增量脚本本身遇已入库 id 即停，天然省事）。

## Sources of truth

- 各包的 `AGENTS.md`：`packages/inspora/AGENTS.md`、`packages/layout-compositions/AGENTS.md` 等。
- 同步脚本：`packages/<pkg>/scripts/sync.ts`。
- 生成物：`apps/web/public/<pkg>/` 与包内 `*.db`（随仓库提交）。
- 读取契约：各包 `src/index.ts`。

## 四个包

| 包 | 入口 | 上游 | 特殊约束 |
| --- | --- | --- | --- |
| inspora | `pnpm sync:inspora` | 三源：inspora / bestx / collectui | 需 Playwright Chromium；`tweet_id` 跨源去重；增量遇已入库 id 停止；事务写入 |
| layout-compositions | `pnpm sync:layouts` | 上游仓库 | 下载缓存落 `.upstream/`（已 gitignore） |
| personal-sites | `pnpm sync:personal-sites` | 本地 `assets/` | 先 `render:promo` 再 sync |
| design-engineer-tools | `pnpm sync:design-engineer-tools` | `https://designengineer.tools/` | 抓取公开站点 |

## One run

### 1. 基线

1. `git status --short --branch`；保留无关脏改动。
2. 确认待同步包。默认四包全跑；用户指定则只跑指定的。

### 2. 同步

按包执行。inspora 首跑需先装浏览器：

```sh
pnpm --filter @personal-design/inspora exec playwright install chromium
pnpm sync:inspora          # 增量；-- --full 全量；-- --source=bestx 单源
```

其余：

```sh
pnpm sync:layouts
pnpm sync:design-engineer-tools
pnpm --filter @personal-design/personal-sites render:promo && pnpm sync:personal-sites
```

inspora 要点（详见 `packages/inspora/AGENTS.md`）：单源失败不阻塞其他源，整体非零退出；分页失败不得留下半批数据；被隐藏的详情必须 404。

personal-sites 渲染的坑（2026-10-23 实测）：Remotion 默认用 3000 端口，本机 Docker 常占用它，渲染会撞到无关页面并报 `window.getStaticCompositions is undefined`。且 `pnpm ... render:promo -- --port=N` 不会把参数透传。改用空闲端口直跑脚本：

```sh
PORT=$(node -e 'const n=require("net");const s=n.createServer();s.listen(0,()=>{console.log(s.address().port);s.close()})')
PATH="$PWD/node_modules/.bin:$PATH" node scripts/render-promo.mjs --port=$PORT
pnpm sync:personal-sites
```

### 3. 验证

```sh
pnpm typecheck
pnpm test
pnpm check:navigation
```

涉及页面渲染（新条目进入列表/详情）时，另跑生产预览下的 HTTP 与浏览器检查：

```sh
export DESIGN_BASE_URL=https://personal-design.localhost
export NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem"
pnpm build && pnpm start
pnpm check:http
pnpm check:browser
```

### 4. 证据与收尾

1. 记录增量数字：各源新增条数、去重后总数、失败项及原因、DB 文件大小变化。
2. 若 `inspora.db` 或媒体有改动，确认无隐私内容混入（访客界面不出现来源站点名）。
3. 提交生成物，message 按 CLAUDE.md 署名规则（历史惯例：`chore(sync): 每日内容同步（<包> 新增 N 帖）`）。
4. 开 PR 合并。

## Checkpoint

- 上游站点结构变更导致抓取失败（需人工判断新结构）；
- 单源连续失败两次；
- 同步结果出现明显异常（条目数骤降、分类全空、媒体大面积 404）；
- 需要 `--full` 全量刷新（耗时且改历史数据）。

## Failure and recovery

- Playwright 遇 Vercel checkpoint：脚本会回退 ego-browser 正常会话，需本机 ego lite。失败则记录并继续其他源。
- 单源失败：保留失败输出，跑其余源，整体非零退出——不要为了让退出码变绿而跳过。
- 中断残留：`.part` 文件是垃圾（已 gitignore），确认后可删。
- 增量漏条：用 `-- --full` 刷新上游旧记录。

## Definition of done

- 目标包同步脚本退出码为 0，或失败项已明确记录且不影响其他源。
- 增量数字与去重结果已写入本轮记录。
- 生成物已提交，PR 已合并。
- 未把上游变动当本站改动、未改上游 catalog 以迁就布局。

## 宿主与调度

- 每日一次，推荐 Codex App heartbeat 或 Claude Code `/loop`。
- 主工作区直接跑（同步脚本写生成物，不需要隔离）；若同时有代码改动，先跑同步再开 worktree 做代码。
- 参考历史：`~/.codex/automations/automation/memory.md` 是另一项目（personal-sites）的每日同步记忆，格式可借鉴。

## 未决

- 四包是否同一触发时点、还是各自独立排程未定。
- 每日具体时刻未定。
