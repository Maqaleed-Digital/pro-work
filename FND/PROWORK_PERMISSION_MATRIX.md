# PROWORK — PERMISSION MATRIX

Version: 1.0
Status: ACTIVE
Phase: 11

---

## Live Roles

| Role | Tier | Description |
|------|------|-------------|
| superadmin | Sovereign | All permissions (wildcard). Full operational control. |
| ops | Operational | Read + execute + retry. No override. |
| auditor | Read-only | No mutations. No operational control. |

---

## Semantic Class → Native Permission Mapping

| Semantic Class | Native Permission String | ops:override? |
|---------------|------------------------|--------------|
| system.read | ops:system:read | — |
| identity.read | ops:identity:read | — |
| admin.read | admin:governance:read | — |
| ops.read | ops:status:read | — |
| ops.execute | ops:execute | — |
| ops.retry | ops:retry | — |
| ops.override | ops:override | superadmin only |

---

## Role-to-Permission Grants

### superadmin
All permissions granted (wildcard). Includes `ops:override`.

### ops
| Permission | Granted |
|-----------|---------|
| admin:stats:read | yes |
| admin:governance:read | yes |
| admin:workers:read | yes |
| admin:workers:write | yes |
| admin:pods:read | yes |
| admin:pods:write | yes |
| admin:principals:read | yes |
| admin:principals:write | yes |
| admin:wos:assignments:write | yes |
| admin:tenants:read | yes |
| admin:tenants:write | yes |
| ops:system:read | yes |
| ops:identity:read | yes |
| ops:status:read | yes |
| ops:execute | yes |
| ops:retry | yes |
| ops:override | **NO** |

### auditor
| Permission | Granted |
|-----------|---------|
| admin:stats:read | yes |
| admin:governance:read | yes |
| admin:workers:read | yes |
| admin:pods:read | yes |
| admin:principals:read | yes |
| admin:tenants:read | yes |
| ops:system:read | yes |
| ops:identity:read | yes |
| ops:status:read | **NO** |
| ops:execute | **NO** |
| ops:retry | **NO** |
| ops:override | **NO** |

---

## Control Rules
- role-based route protection remains active (Phase 10)
- sensitive operational actions require explicit permission checks (Phase 11)
- missing permission mapping → deny
- unknown permission string → deny (not in PERMS catalog)
- missing resolved permission set → deny
- permission guard error → deny

## Status Codes
- missing/invalid auth on protected route → 401 UNAUTHORIZED
- authenticated but insufficient role or permission → 403 FORBIDDEN
