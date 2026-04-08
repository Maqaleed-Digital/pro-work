# PROWORK — PHASE 14: POLICY-BOUND CONFIGURATION + SOVEREIGN CONTROL REGISTRY

Version: 1.0
Status: ACTIVE
Phase: 14

---

## Objective

Introduce a centralized, runtime-resolved sovereign control registry that gates all
privileged operations before execution. Every approval-bound action must first resolve
an active sovereign control entry. Unknown, disabled, or missing controls fail closed
(403 POLICY_CONTROL_MISSING).

---

## Sovereign Control Registry

- Module: `app/lib/sovereign_registry.js`
- Runtime storage: in-memory Map, keyed by `control_key`
- Optional override file: `app/data/sovereign_registry.json` (merges status/value only)
- Defaults are authoritative; override file cannot add new keys

### Resolution Rules

| Condition           | ok    | reason        | HTTP result        |
|---------------------|-------|---------------|--------------------|
| Key unknown         | false | unknown_key   | 403 (fail closed)  |
| Entry missing       | false | missing       | 403 (fail closed)  |
| Status != active    | false | disabled      | 403 (fail closed)  |
| Status == active    | true  | —             | proceed            |

---

## Control Key Catalog (CONTROL_KEYS)

| Constant                          | Key string                                      | Family               | Default value |
|-----------------------------------|-------------------------------------------------|----------------------|---------------|
| OPS_OVERRIDE_REQUIRES_APPROVAL    | ops.override.requires_approval                  | approval_policy      | true          |
| OPS_FORCE_EXECUTE_REQUIRES_APPROVAL | ops.force_execute.requires_approval           | approval_policy      | true          |
| ADMIN_CONFIG_CHANGE_REQUIRES_APPROVAL | admin.config_change.requires_approval       | approval_policy      | true          |
| PRIVILEGED_AUDIT_REQUIRED         | privileged.audit.required                       | audit_policy         | true          |
| PRIVILEGED_MAKER_CHECKER_REQUIRED | privileged.approval.maker_checker.required      | approval_policy      | true          |
| SOVEREIGN_REGISTRY_VERSION        | sovereign.registry.version                      | privileged_operation | "1.0"         |
| RUNTIME_GUARD_FAIL_CLOSED         | runtime.guard.fail_closed.enabled               | runtime_guard_policy | true          |

---

## Policy-Registry Admin Routes (superadmin only)

| Method | Route                                          | Description                        |
|--------|------------------------------------------------|------------------------------------|
| GET    | /api/admin/policy-registry                     | List all control entries           |
| GET    | /api/admin/policy-registry/export              | Export registry artifact (JSON)    |
| POST   | /api/admin/policy-registry/:key/disable        | Disable a control (in-memory)      |
| POST   | /api/admin/policy-registry/:key/enable         | Re-enable a control (in-memory)    |

---

## Execution Guard Pattern

```
requireSovereignControl(res, CONTROL_KEYS.X, correlationId)
  → resolveControl(key)
  → logs sovereign.control.resolved
  → if !ok: fail(res, POLICY_CONTROL_MISSING, ..., 403) and return null
  → caller checks for null before proceeding
```

Applied to: ops.override, ops.force_execute, admin.config_change (before approval gate).

---

## Phase 14 Policies

- POLICY-REGISTRY-LOADED: all minimum required keys present and active at startup
- POLICY-CONTROL-VERSION-PRESENT: sovereign.registry.version resolves with control_version
- POLICY-RUNTIME-GUARD-FAIL-CLOSED: runtime.guard.fail_closed.enabled is active with value true
- POLICY-UNKNOWN-CONTROL-DENIED: unknown key resolves ok:false, reason unknown_key
- POLICY-MAKER-CHECKER-ENFORCED-FROM-REGISTRY: maker-checker control resolves active
- POLICY-AUDIT-REQUIRED-ENFORCED-FROM-REGISTRY: audit required control resolves active
- POLICY-REGISTRY-EXPORT-GENERATED: exportRegistry artifact has correct structure
- POLICY-SOVEREIGN-CONTROL-GATES-PRIVILEGED-OPS: ops.override/force_execute/config_change are gated
- POLICY-REGISTRY-DISABLE-BLOCKS-EXECUTION: disabling a control prevents execution (403)
