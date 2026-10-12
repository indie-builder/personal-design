# cards.test.mjs 测试缺陷修复

## Bug fix 步骤（来自 poteto-mode bug-fix playbook）

1. Reproduce it yourself on the matching surface via the driver skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires.
   - surface: node:test 直接跑 cards.test.mjs；变异实验即复现
2. Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives. Seed them with `how` over the affected subsystem and the **why** skill for regression history. Each pass, take the split that cuts the most remaining problem space, get runtime evidence, eliminate. When program state is unclear, add instrumentation or logging and read it as the code runs. Don't guess. Drive a long or stubborn hunt with Claude Code's `loop` skill. Confirm the surviving *mechanism* with runtime evidence before the step-3 architect/interrogate fan-out.
   - skip: 缺陷机制已由最终 review 指明并核实（mock 内 assert 被生产 try/catch 吞），无需二分
3. Plan the fix. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent using your configured bug-fix model (default in poteto-mode's Models section) with a specific scope.
   - skip: 单测试文件最小 diff，用户已给出修法
4. Verify on the same surface. The original repro now passes. "Inconclusive" or wrong-surface is not a pass. Flag it. Unit tests show branch behavior, not bug absence.
5. Stage the commits so the failing repro lands before the fix in git history. See the **tdd** skill for the failing-test-first cadence when the bug has a cheap local test path. Skip it when the test would be expensive, integration-heavy, or unclear.
   - skip: 生产代码不变，变异只作为本地证据不留痕
6. Run **Opening a PR**.

## Opening a PR 步骤（来自 poteto-mode opening-a-pr playbook）

- Worktree: skip: 单文件最小 diff，用户指定新本地分支即可
- Commits: 单提交
- PRs: /deslop、/no-comments、/technical-writing、/unslop 应用；pr skill 写 PR body
- Titles: test(inspora): ... 形式
- Descriptions: briefing 结构（Why/What changed/Scope/Blast Radius/Verification）
- Forge: gh
- Size and stacks: 单 PR
- Readiness: ready，非 draft
- Babysit: 用户要求等 CI 并合并，按用户流程执行

## 任务步骤（用户指令）

- [x] 读 poteto-mode SKILL.md 与相关 principle 叶技能
- [x] 核实缺陷：cards.test.mjs:139 mock 内 assert 可被生产 try/catch 吞
- [x] 新本地分支 fix/cards-test-swallowed-assert
- [x] 变异实验 1：listPostCards 临时改为经 toMedia 解析全部媒体再 slice(0,1)，原测试仍 4/4 通过（漏检证明）
- [x] 修复测试：mock 记录解析尝试，调用后外部断言，保留原 JSON.parse 行为与 finally restore
- [x] 变异实验 2：同一变异下新测试恰在 assert.ok(!parsed.includes(...)) 失败（检出证明）
- [x] 还原生产变异，diff 仅该测试（git diff 确认）
- [x] 定向测试 node --test packages/inspora/src/cards.test.mjs 4/4
- [x] pnpm test 203/203；format:check 干净；oxlint exit 0
- [x] 委派一位 Opus 独立 review 修复后预提交 diff（APPROVE，独立复跑变异与 4/4）
- [x] 提交（44a7cf8，GLM-5.3 署名）并开 PR #62
- [x] CI 绿（verify、Vercel、Vercel Preview Comments 全 pass）
- [x] match-head-commit squash 合并，main 新 tip 3c68373
- [x] main CI 绿（CI completed success）
- [x] 切回 main ff-only（32ebe8e → 3c68373），本地与远端分支已删
