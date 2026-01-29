# ProWork — Sprint S5 Execution Guide (Repo-Tracked)

Repo Root
/Users/waheebmahmoud/dev/pro-work

Purpose
Sprint S5 hard-close guide that is runnable, evidence-producing, and Emergent-compatible.

Scope (S5)
1. Repo hygiene: install, lint, typecheck, tests
2. Health verification: /api/health (or equivalent)
3. Evidence pack: timestamped folder with all outputs
4. Closure statement: PASS or BLOCKED with reason

How to run (local)
Path
/Users/waheebmahmoud/dev/pro-work

Command
bash "scripts/sprint_s5_next3moves.sh"

Evidence Output
/Users/waheebmahmoud/dev/pro-work/evidence/sprintS5/<UTC_TIMESTAMP>/

Acceptance Criteria
- npm install or npm ci succeeds
- lint passes or is explicitly recorded as failed with logs
- typecheck passes or is explicitly recorded as failed with logs
- tests pass or are explicitly recorded as failed with logs
- health endpoint returns ok (or is explicitly recorded with output)
- summary markdown exists in evidence folder

Notes
- This guide is intentionally evidence-first.
- If an older S5 guide is later found elsewhere, merge it into this file and keep this as canonical.
