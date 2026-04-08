# WORKCAPTAIN — RBAC EVIDENCE CONTRACT

Version: 1.0
Status: ACTIVE

## 1. Required Evidence Pack

Each Phase 10 gate run must produce:

| File                              | Content                                  |
|-----------------------------------|------------------------------------------|
| `health_response.txt`             | /health response body                    |
| `health_status_code.txt`          | HTTP status code                         |
| `admin_unauth_response.txt`       | /admin no-token response                 |
| `admin_unauth_status_code.txt`    | Must be 401                              |
| `admin_operator_response.txt`     | /admin with operator token               |
| `admin_operator_status_code.txt`  | Must be 403                              |
| `admin_auth_response.txt`         | /admin with admin token                  |
| `admin_auth_status_code.txt`      | Must be 200                              |
| `identity_unauth_response.txt`    | /auth/identity no-token response         |
| `identity_unauth_status_code.txt` | Must be 401                              |
| `identity_auth_response.txt`      | /auth/identity with viewer token         |
| `identity_auth_status_code.txt`   | Must be 200                              |
| `ops_ping_unauth_response.txt`    | /ops/ping no-token response              |
| `ops_ping_unauth_status_code.txt` | Must be 401                              |
| `ops_ping_viewer_response.txt`    | /ops/ping with viewer token              |
| `ops_ping_viewer_status_code.txt` | Must be 403                              |
| `ops_ping_operator_response.txt`  | /ops/ping with operator token            |
| `ops_ping_operator_status_code.txt` | Must be 200                            |
| `MANIFEST.txt`                    | All codes + timestamp + commit           |
| `decision_log.txt`                | Timestamped execution log                |

## 2. Failure Rule

Phase 10 is not complete if:
- Any protected route accepts a lower-privilege token
- Any unauthenticated request to a protected route returns non-401
- Any authenticated-but-insufficient request returns non-403
- Evidence is incomplete
