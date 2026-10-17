# CI 清扫 loop

## Outcome

PR 的 CI 从红到绿，且每一处修复都有本地复现证据。不把「重跑一遍就过了」当作修复。

## Trigger

- **Event（优先）**：PR 上出现失败 check，或本地 `pnpm test`/`pnpm build` 变红。
- **Schedule**：PR 活跃期间每 30–60 分钟检查一次。
- 无活跃 PR 时静默，不唤醒。

## Sources of truth

- `.github/workflows/ci.yml` 是 CI 的权威定义。
- `package.json` 的 scripts 是本地等价入口。
- `scripts/design-checks/current-checks.json` 是检查清单。

## CI 步骤 ↔ 本地命令

| CI step | 本地等价 |
| --- | --- |
| Agent environment contracts | `pnpm check:navigation && pnpm check:skills` |
| Typecheck | `pnpm -r typecheck` |
| Lint | `pnpm lint` |
| Format check | `pnpm format:check` |
| Unit tests | `pnpm test` |
| Build | `pnpm build` |
| Isolated chat acceptance | `pnpm check:chat` |

CI 在 ubuntu + Node 24 + `pnpm install --frozen-lockfile`。本地差异（平台、Node 小版本）是首要怀疑对象。

## One run

### 1. 取失败

1. `gh pr checks` 或 `gh run view --log-failed` 取失败 step 与决定性日志行。
2. 记录失败的 commit、step 名、原始报错（最短决定性行）。

### 2. 本地复现

1. 在该 PR 分支（或对应 worktree）跑上表里同名的本地命令。
2. 复现成功 → 进入第 3 步。
3. 复现失败（本地绿）→ 按顺序排查：`--frozen-lockfile`（本地 lock 是否漂移）、Node 版本（CI 24.x + check-latest）、平台差异（大小写敏感、路径分隔符、shell）、缓存（`cache: pnpm`）。

### 3. 修

1. 修根因，不在 CI 里加跳过或 `continue-on-error`。
2. 若失败源于 flaky 检查（历史记录：`shared-autoplay` 在批量连跑时约 1/6 偶发），先单跑确认稳定，再决定是修检查还是修被测代码——不要直接重跑掩盖。
3. 每次只改一处，改完立刻跑对应本地命令。

### 4. 验证与收尾

1. 跑完整本地套件（上表全部）确认无回归。
2. push，等 CI。
3. CI 全绿后合并（独立验证 PASS 即守卫合并，不额外等确认）。
4. 连续两次修不好 → 停下来写清阻塞点，问用户。

## Checkpoint

- 失败看起来是基础设施问题（网络、runner、上游 action 版本）而非代码；
- 需要改 CI 配置本身（`.github/workflows/ci.yml`）；
- 同一 check 连续失败两次；
- flaky 判定需要产品取舍。

## Failure and recovery

- `--frozen-lockfile` 失败：本地 `pnpm install` 后提交 lock 变更。
- 构建 OOM 或超时：先量测，再决定是否拆步骤；不改 CI 资源配额除非用户授权。
- 检查脚本自身报错：可能是 `current-checks.json` 与实体不一致，按 doc-drift loop 处理。

## Definition of done

- 目标 PR 的所有 check 绿。
- 每处修复都有本地复现记录（命令 + 结果）。
- 没有通过跳过、忽略或重跑掩盖失败。
- 未把 flaky 当已修。

## 宿主与调度

- 事件触发为主：本地跑红即进入一轮。
- 排程：Codex App heartbeat（`ci-sweeper` preset 的 `dry_run_report_first` 模式），或 Claude Code `/loop` 带 `loopx quota should-run` 闸。
- 隔离：修 CI 的代码改动走 worktree；只读诊断可在主工作区。

## 未决

- 「PR 活跃期间」的精确定义（有 open PR？有 assigned reviewer？）未定。
- flaky 检查的判定阈值与处置流程未定。
