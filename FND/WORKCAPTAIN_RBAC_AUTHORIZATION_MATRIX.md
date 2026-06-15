# WORKCAPTAIN — RBAC AUTHORIZATION MATRIX

Version: 1.0
Status: ACTIVE

## Route × Role Matrix

| Route            | public | viewer | operator | admin |
|------------------|--------|--------|----------|-------|
| `/health`        | 200    | 200    | 200      | 200   |
| `/ready`         | 200    | 200    | 200      | 200   |
| `/auth/identity` | 401    | 200    | 200      | 200   |
| `/ops/ping`      | 401    | 403    | 200      | 200   |
| `/admin`         | 401    | 403    | 403      | 200   |

## Enforcement Rule

- 401 = no token (public tier, unauthenticated)
- 403 = authenticated but role below required level
- 200 = authenticated and role meets or exceeds required level

## Token Resolution Order

`API_ADMIN_TOKEN` checked first → `API_OPERATOR_TOKEN` → `API_VIEWER_TOKEN` → public (0)

Unknown or invalid tokens resolve to public tier (fail-closed).
