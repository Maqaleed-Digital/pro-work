# PROWORK — PHASE 20: BUSINESS CONTINUITY + DISASTER RECOVERY GOVERNANCE LAYER

Version: 1.0
Status: ACTIVE
Phase: 20
Source of Truth Base: a4465c0

---

## Objective

Extend the Phase 19 incident-contained runtime with governed business continuity (BC) and
disaster recovery (DR) controls. Governed execution proof paths must declare their
continuity mode and recovery state. Degraded and failover modes restrict privileged
execution. Active recovery restricts mutation/release paths. All prior controls remain
active and take precedence (incident containment is checked first).

---

## Architecture

Phase 20 is **additive**. All Phase 10–19 controls remain intact. Phase 20 adds continuity
and DR governance as declared-header-validated gates on the proof route, plus an in-memory
system state settable by superadmin:

```
governed-continuity-exec:
  authenticate → permission check → containment check (P19) →
  continuity mode check (P20) → recovery state check (P20) → execute (202)
```

---

## New Module: app/lib/continuity_dr.js

### Continuity Mode Catalog

| Mode     | Restricted | Description                                         |
|----------|------------|-----------------------------------------------------|
| normal   | no         | Standard operations; all governed paths available   |
| degraded | yes        | Limited operations; privileged exec restricted      |
| failover | yes        | Failover mode; strict restoration boundaries        |

### DR Recovery State Catalog

| State           | Restricted | Description                                      |
|-----------------|------------|--------------------------------------------------|
| standby         | no         | Normal standby; no active recovery in progress   |
| active_recovery | yes        | Recovery in progress; mutation paths restricted  |
| restored        | no         | Recovery completed; operations restored          |

### Functions

| Function                            | Description                                              |
|-------------------------------------|----------------------------------------------------------|
| validateContinuityMode(mode)        | Fail-closed: unknown → {ok:false}                        |
| validateRecoveryState(state)        | Fail-closed: unknown → {ok:false}                        |
| isRestrictedContinuityMode(mode)    | True for degraded and failover                           |
| isRestrictedRecoveryState(state)    | True for active_recovery                                 |
| setContinuityMode(mode, setBy)      | In-memory admin/test mutation with transition log        |
| setRecoveryState(state, setBy)      | In-memory admin/test mutation with transition log        |
| getCurrentMode()                    | Returns current continuity mode                          |
| getCurrentRecoveryState()           | Returns current DR recovery state                        |
| getGovernanceState()                | Read-only snapshot                                       |
| exportGovernance(outputPath?)       | JSON artifact, no state mutation                         |

---

## New Server Routes

### Admin — superadmin (OPS_OVERRIDE permission) only

| Method | Route                                                   | Name                            |
|--------|---------------------------------------------------------|---------------------------------|
| GET    | /api/admin/continuity-governance                        | continuity.context              |
| GET    | /api/admin/continuity-governance/export                 | continuity.export               |
| POST   | /api/admin/continuity-governance/mode                   | continuity.set_mode             |
| POST   | /api/admin/continuity-governance/recovery-state         | continuity.set_recovery_state   |

### Continuity/DR-Gated Proof Route

| Method | Route                              | Required Headers                                    |
|--------|------------------------------------|-----------------------------------------------------|
| POST   | /api/ops/governed-continuity-exec  | Authorization, X-Continuity-Mode, X-Recovery-State  |

---

## Fail-Closed Rules

| Condition                          | HTTP Code | Error Code                   |
|------------------------------------|-----------|------------------------------|
| Missing X-Continuity-Mode          | 403       | CONTINUITY_MODE_REQUIRED     |
| Unknown continuity mode            | 403       | CONTINUITY_MODE_DENIED       |
| Degraded or failover mode          | 403       | CONTINUITY_MODE_RESTRICTED   |
| Missing X-Recovery-State           | 403       | RECOVERY_STATE_REQUIRED      |
| Unknown recovery state             | 403       | RECOVERY_STATE_DENIED        |
| Active recovery state              | 403       | RECOVERY_STATE_RESTRICTED    |
| Active critical incident (P19)     | 403       | CONTAINMENT_ACTIVE           |

---

## Logging

All continuity/DR governance decisions are logged. Events:
- `continuity.governance.missing_mode`
- `continuity.governance.resolved`
- `continuity.governance.restricted`
- `dr.governance.missing_state`
- `dr.governance.resolved`
- `dr.governance.restricted`
- `continuity.mode.set`
- `continuity.recovery_state.set`
- `governed.continuity_exec.accepted`
