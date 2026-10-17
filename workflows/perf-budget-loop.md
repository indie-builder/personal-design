# 性能预算 loop

## Outcome

已知性能项不退化。每一项都有阈值、有测量方法、有历史基线；超预算即报警并给出证据，而不是等用户感觉到慢。

## Trigger

- **Event（优先）**：改动触及图片管线、打包配置、路由数据加载、动效。
- **Schedule**：每周一次基线复测。
- 无相关改动时静默。

## Sources of truth

- `docs/design/execution/optimization-audit.md`：O1–O6 的现状、方案与验收口径。
- `docs/design/execution/home-performance.md`：首页性能实测。
- 检查脚本：`scripts/design-checks/home-performance.browser.mjs`、`scripts/design-checks/muse-performance.mjs`、`scripts/design-checks/book-opening-performance.mjs`、`scripts/design-checks/layout-first-paint.mjs`。

## 已登记的预算

| 项 | 指标 | 阈值 | 来源 |
| --- | --- | --- | --- |
| O2 | ai-chat 路由 chunk gzip | < 400KB | optimization-audit.md 验收口径 |
| O3/O4 | `/_image` 重复请求 | 命中缓存，转换只发生一次 | 同上 |
| O5 | muse 详情二次请求 TTFB | 与热路径持平（热 6.6–8.4ms） | ACTIVE_GOAL_STATE 记录 |
| O6 | `check:browser` 批量 | 连跑 3 次全绿 | 同上 |
| 首页 | rAF 中位间隔 | 正常场景约 8.3ms，不限帧 | home-performance.md |

**注意**：部分项目前只有实测值没有硬阈值。首次运行本 loop 时应把阈值补进本表并落盘，否则「不退化」没有判据。

## One run

### 1. 基线

记录当前 commit、`pnpm build` 产物。若是首次运行，先测一轮现状并写入本表。

### 2. 测量

```sh
pnpm build
pnpm start        # 另一终端
export DESIGN_BASE_URL=https://personal-design.localhost
export NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem"
pnpm check:browser
```

chunk 大小从构建产物取；`/_image` 缓存行为用重复请求实测（见 optimization-audit.md 的验收口径）。

### 3. 判定

1. 每项与阈值和上一轮基线比。
2. 超阈值 → 记录数值、测量方法、可能原因。
3. 未超但显著劣化（>10%）→ 记录，观察是否趋势性。

### 4. 处理

- 退化由本轮改动引起 → 修，重测。
- 退化原因不明 → 先诊断（可用 `loopx performance-diagnosis`），不盲目优化。
- 阈值本身不合理 → 提出调整建议，等用户决定，不自行放宽。

### 5. 证据

数值、方法、结论写入 `docs/design/execution/evidence/` 或更新 optimization-audit.md 的验收口径段。

## Checkpoint

- 需要调整阈值；
- 退化需要架构级改动（如 optimization-audit.md 里「提案不实施」段列的 inspora.db 体积、maxDuration）；
- 优化需要引入新依赖。

## Failure and recovery

- 测量噪声大：固定机器状态、连测 3 次取中位；记录方差。
- 本机负载影响：先确认无其他重负载进程。
- 与生产不一致：本机测量只作趋势判据，绝对数值不作生产承诺。

## Definition of done

- 每项登记预算都有本轮数值。
- 超阈值的项已修，或已带证据记录并归因。
- 阈值表已更新（首次运行时）。
- 未做无证据的加速宣称。

## 宿主与调度

- 每周一次，推荐 Codex App heartbeat 或 Claude Code `/loop`。
- 主工作区跑；测量期间避免并发重负载。

## 未决

- 阈值表补齐前，本 loop 只能记录不能判定。
- 是否接入 CI 作为门禁（会增加 CI 时长）未定。
