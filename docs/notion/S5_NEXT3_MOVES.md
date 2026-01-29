ProWork — Next 3 Moves
Finish S5, Build One Marketplace Loop

Repo
/Users/waheebmahmoud/dev/pro-work

Move 1 — Finish S5 (Hard Close with Evidence)

Objective
Run checks, generate evidence pack, and declare closure.

Run
Path
/Users/waheebmahmoud/dev/pro-work

Command
bash "scripts/sprint_s5_next3moves.sh"

Evidence
/Users/waheebmahmoud/dev/pro-work/evidence/sprintS5/<UTC_TIMESTAMP>/
Primary artifact: S5_NEXT3_MOVES_SUMMARY.md

Acceptance Criteria
- install_ok=true
- lint_ok=true
- typecheck_ok=true
- test_ok=true
- health captured (ok true preferred)

Move 2 — Build One Marketplace Loop (Minimum Money Loop)

Objective
Prove the marketplace loop end-to-end:
Buyer posts job -> Seller applies -> Buyer accepts -> Job completes -> Payout recorded

Minimum endpoints (placeholder if not implemented yet)
POST /api/loop/job
POST /api/loop/apply
POST /api/loop/accept
POST /api/loop/complete
POST /api/loop/payout

Evidence
Loop outputs in evidence folder:
loop/01_job.json
loop/02_apply.json
loop/03_accept.json
loop/04_complete.json
loop/05_payout.json

Move 3 — Governance + Emergent Enablement

Objective
Make the loop repeatable by Emergent:
- Single runner command
- Evidence pack output
- Notion paste page updated
- Closure declaration included in summary

Deliverables
- docs/sprints/S5_EXECUTION_GUIDE.md
- docs/notion/S5_NEXT3_MOVES.md
- scripts/sprint_s5_next3moves.sh
- evidence/sprintS5/<UTC_TIMESTAMP>/*
