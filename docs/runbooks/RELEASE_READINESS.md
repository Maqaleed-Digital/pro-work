Release Readiness Checklist

Go/No-Go

| Check | Command | Pass Criteria |
|---|---|---|
| Syntax | `node -c app/server.js` | exits 0 |
| Install | `cd app && npm ci` | exits 0 |
| Lint | `cd app && npm run lint` | 0 errors |
| Typecheck | `cd app && npm run typecheck` | 0 errors |
| Tests | `cd app && npm test` | all pass |
| Health | `curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3010/health` | 200 |
| RBAC 401 (no token) | `curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3010/admin/stats` | 401 |
| RBAC 403 (viewer on workers) | `curl -sS -o /dev/null -w "%{http_code}" -H "Authorization: Bearer <VIEWER_TOKEN>" http://127.0.0.1:3010/admin/workers` | 403 |
| Admin 200 (superadmin) | `curl -sS -o /dev/null -w "%{http_code}" -H "Authorization: Bearer <SUPERADMIN_TOKEN>" http://127.0.0.1:3010/admin/stats` | 200 |
| CI | GitHub Actions | green |
| Evidence | `SPRINT="S24" bash scripts/s23_closure_evidence.sh` | evidence folder exists |

Decision

| Gate | Status |
|---|---|
| Code (syntax/install/lint/typecheck/test) | ☐ |
| Runtime (health) | ☐ |
| RBAC (401/403/200 where applicable) | ☐ |
| CI | ☐ |
| Evidence attached to Notion | ☐ |

RELEASE: ☐ GO / ☐ NO-GO

Operator Commands

Start server:
`cd app && node server.js`

Health:
`curl http://127.0.0.1:3010/health`

Evidence runner:
`SPRINT="S24" API="http://127.0.0.1:3010" bash scripts/s23_closure_evidence.sh`

Optional tokens (do not commit secrets):
`ADMIN_SUPERADMIN_TOKEN="..." ADMIN_VIEWER_TOKEN="..." SPRINT="S24" bash scripts/s23_closure_evidence.sh`

Sign-off

| Role | Name | Date |
|---|---|---|
| Engineer |  |  |
| Reviewer |  |  |
| CEO | Waheeb Ghassan Mahmoud |  |
