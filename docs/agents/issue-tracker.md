# Issue tracker: GitHub

本仓库的任务与规格使用 GitHub Issues：`indie-builder/personal-design`。通过 `gh` CLI 操作，仓库以 `git remote -v` 为准。

## 常用操作

- 读取：`gh issue view <number> --comments`，同时检查正文、标签和关联 PR。
- 列表：`gh issue list --state open --json number,title,body,labels`。
- 创建：`gh issue create --title "..." --body-file <file>`。
- 评论：`gh issue comment <number> --body-file <file>`。
- 标签：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`。
- 关闭：`gh issue close <number>`，附上实际处理结果；不把未完成任务标为解决。

多行正文先写文件，再使用 `--body-file`。技能说“publish to the issue tracker”时，目标是 GitHub issue；说“fetch the relevant ticket”时，读取相应 issue 及评论。技能约定不替代用户对发布、评论或其他外部操作的授权。

## Pull requests as a triage surface

**PRs as a request surface: no.** PR 用于审查与合并已实现的变更，不自动作为外部需求加入 triage 队列。

GitHub Issues 与 PR 共用编号空间。遇到不明确的编号，先检查 `gh pr view <number>`，再检查 `gh issue view <number>`，不要把 PR 当作普通 issue 改写。

## Wayfinding operations

- Map：单个 `wayfinder:map` issue，保存 Notes / Decisions-so-far / Fog。
- Child ticket：通过 GitHub sub-issue 关联到 map；不可用时使用 map 的任务列表，并在子任务正文写 `Part of #<map>`。类型标签使用 `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling`、`wayfinder:task`。
- Blocking：优先使用 GitHub 原生 issue dependencies；接口不可用时使用正文 `Blocked by: #<number>`。只有全部 blocker 关闭才算解除阻塞。
- Frontier：按 map 中的顺序选择开放、未分配、无开放 blocker 的子任务。
- Claim：执行任务前，在已获授权的工作流中用 `gh issue edit <number> --add-assignee @me` 认领。
- Resolve：记录结果、关闭已完成任务，并把结论链接更新到 map；保留未完成和未验证事项。
