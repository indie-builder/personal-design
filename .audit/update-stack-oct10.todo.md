# Upgrade stack to latest stable (2026-10-10, branch chore/update-stack-oct10)

Baseline: HEAD 309b170 == origin/main #57 (same patch-id); main ahead only by README #58. User uncommitted work untouched: skills-lock.json, .agents/skills/better-readme/, .claude/skills/better-readme.

Steps:
- [x] Read PRODUCT.md, navigation.md, AGENTS.md files, dependency-upgrade-preference memory
- [x] Confirm git branch / remote baseline
- [x] Inventory all maintained manifests (root, apps/web, 6 packages with deps), pnpm-workspace.yaml, CI
- [x] Query registry latest for every dep (npm view, live)
- [x] Decide per-package: upgrade / already-latest / hold with evidence
- [x] Edit manifests + install (lockfile)
- [x] Verify: typecheck -r PASS, lint PASS, test 199/199 PASS, build PASS
- [x] Regression: check:http PASS (routes + portfolio, DESIGN_BASE_URL=https://personal-design.localhost:1355, NODE_EXTRA_CA_CERTS=portless CA); evidence routes.json reordering reverted
- [x] Report before/after versions, files, commands, limitations

Findings:
- Registry latest today: everything current EXCEPT lucide-react 1.55.0 (published 2026-10-10T06:12Z), @types/node 24.x line 24.19.2, @effect/platform-node 4.0.3 (2026-10-10T10:04Z).
- HOLD @effect/platform-node at 4.0.2: 4.0.3 peer-requires effect ^4.0.3; effect 4.0.3 not published (latest 4.0.2, dist-tags + time verified). Revisit when effect 4.0.3 ships.
- @types/node latest is 26.6.5; keep 24.x line (user constraint: Node stays Vercel-supported 24.x) -> 24.19.2.
- pnpm 12.10.1 is latest; portless 0.15.7 latest; CI actions checked.
- skip: Node 26 / @types/node 26 (user-excluded); remotion overrides unchanged (remotion 4.0.534 still latest).

Decision trail (.audit/update-stack-oct10.tsv).

## Delivery phase (2026-10-10, same session takeover)

Branch rebuilt: 8-file diff stashed, rebased onto origin/main b49a1a3 (309b170 skipped as already applied via #57), stash popped; diff hash e42eb1f8 unchanged. User dirty state untouched: skills-lock.json, .agents/skills/better-readme/, .claude/skills/better-readme, .audit/*.

Shipping playbook steps (all done 2026-10-10):
- [x] 1. Resolve the forge and dependency chain. (gh; no origin CLI; single-PR chain: chore/update-stack-oct10 fb68ef8 -> main b49a1a3)
- [x] 2. Verify each PR independently. (one review delegation, verdict PASS at fb68ef8; runtime substituted the requested Opus for codex/gpt-6-astra:low, disclosed at https://github.com/indie-builder/personal-design/pull/59#issuecomment-6098051737)
- [x] 3. Find the contiguous verified run. (single PR, ceiling = #59)
- [x] 4. Cancel pending merges before changing the chain. (nothing pending; merge executed immediately after verification)
- [x] 5. Prepare only the bottom PR. (rebase onto origin/main dropped patch-equivalent 309b170; PR diff = fb68ef8 only)
- [x] 6. Reassess the evidence. (diff hash e42eb1f8 unchanged through branch surgery; local checks ran on identical content; CI re-ran everything at fb68ef8)
- [x] 7. Merge with a service-enforced head condition. (gh pr merge 59 --squash --match-head-commit fb68ef8; merge commit dc0ffff)
- [x] 8. Arm future merging only with durable verification gates. (no --auto armed; no queue)
- [x] 9. Watch the frontier and preserve its verdict. (verify pass 1m48s all steps; Vercel pass)
- [x] 10. Confirm the landing before advancing. (dc0ffff in origin/main history; lucide-react 1.55.0 + @types/node 24.19.2 + workspace excludes verified on main; main CI run 38056400437 success)
- [x] 11. Stop at the ceiling. (no further PRs)

Opening-a-pr steps:
- [x] deslop over the diff before commit (checklist applied directly; no prose/logic in diff; subagent skipped, one-delegation grant reserved for review)
- [x] no-comments before review — skip: JSON manifests and lockfile cannot hold comments; workspace yaml diff adds none
- [x] PR title/body via pr skill + technical-writing + unslop
- [x] commit with actual-model attribution (GLM-5.3, verified from session; user believed Sonnet)
- [x] push --force-with-lease (history rewrote), open PR ready (not draft) — PR #59
- [x] wait CI completion (verify success: frozen install, navigation+skills, typecheck, lint, format, test, build, check:chat)
- [x] independent Opus review PASS (model substituted by runtime, disclosed on PR)
- [x] merge squash --match-head-commit, confirm landing on main (dc0ffff; main CI success)

Result: PR https://github.com/indie-builder/personal-design/pull/59 merged; user dirty state (skills-lock.json, .agents/skills/better-readme/, .claude/skills/better-readme, .audit/*) untouched.
