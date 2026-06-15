# WORKCAPTAIN — PHASE 10: RBAC + OPERATOR AUTHORIZATION LAYER

Version: 1.0
Status: ACTIVE

## 1. Objective

Implement a fail-closed role-based access control (RBAC) model in `api-service`. Every protected route enforces a minimum required role. Unauthenticated requests return 401. Authenticated requests below the required role return 403.

## 2. Role Model

| Role     | Level | Token Env Var         |
|----------|-------|-----------------------|
| public   | 0     | (none)                |
| viewer   | 1     | `API_VIEWER_TOKEN`    |
| operator | 2     | `API_OPERATOR_TOKEN`  |
| admin    | 3     | `API_ADMIN_TOKEN`     |

## 3. Access Tiers

| Route           | Min Role | Public Access |
|-----------------|----------|---------------|
| `/health`       | public   | yes           |
| `/ready`        | public   | yes           |
| `/auth/identity`| viewer   | no            |
| `/ops/ping`     | operator | no            |
| `/admin`        | admin    | no            |

## 4. Enforcement Contract

- No token present → 401 Unauthorized
- Token present but role below minimum → 403 Forbidden
- Token present and role meets minimum → 2xx
- Fail-closed: unknown or empty tokens treated as public (role=0)
- No token env var set → that tier is inaccessible (token match fails)

## 5. Implementation

Authorization is enforced in `services/api-service/main.go` via:

- `tokenRole(r *http.Request) int` — resolves inbound bearer token to role level
- `requireRole(w, r, minRole int) bool` — writes 401/403 and returns false if role insufficient

## 6. Evidence

Evidence pack is at `FND/EVIDENCE/WORKCAPTAIN-PHASE-10-RBAC-OPERATOR-AUTHORIZATION-LAYER/<TIMESTAMP>/`.

10 test cases in `services/api-service/main_test.go` cover all role/route combinations.
