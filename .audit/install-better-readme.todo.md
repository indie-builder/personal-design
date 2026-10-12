# install-better-readme todo

- [x] Read PRODUCT.md, navigation.md (skill sync rules), AGENTS.md, shipping/opening-a-pr/babysit playbooks, merge-safety, pr skill
- [x] Verify install: upstream tommy0103/better-readme-skill@fa3dce1 byte-identical (2 files, no extras); lock computedHash reproduces via skills CLI folder-hash scheme (control: canvas-design matches); symlink exact; policy file unchanged
- [x] Content/safety review of SKILL.md + art-of-readme.md: prose only, no executable code, no injection patterns
- [x] Checks: check:skills (68/68), check:navigation, test:navigation (12/12), pnpm test (199/199)
- [x] Branch chore/install-better-readme off origin/main (dc0ffff); commit 5d7a3c2, 4 files, GLM-5.3 trailer
- [x] PR #60 opened; CI green at 5d7a3c2 (verify 1m52s, Vercel pass); Opus independent review PASS+NOTES, note (activation wording) fixed via PR body edit
- [x] Merged squash with --match-head-commit 5d7a3c2; merge commit 29b5274, state MERGED; content verified on main
- [x] Main CI green at 29b5274; local main fast-forwarded, checkout left on main
