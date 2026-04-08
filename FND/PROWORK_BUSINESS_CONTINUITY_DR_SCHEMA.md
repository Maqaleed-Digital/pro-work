# PROWORK — BUSINESS CONTINUITY / DISASTER RECOVERY GOVERNANCE SCHEMA

Version: 1.0
Status: ACTIVE
Phase: 20

---

## Continuity Mode Schema

| Field                   | Type    | Description                                         |
|-------------------------|---------|-----------------------------------------------------|
| continuity_mode         | string  | normal / degraded / failover                        |
| continuity_mode_restricted | boolean | true if mode restricts governed paths             |
| continuity_policy_version | string | Governance version                                |

---

## Disaster Recovery State Schema

| Field                    | Type    | Description                                       |
|--------------------------|---------|---------------------------------------------------|
| recovery_state           | string  | standby / active_recovery / restored              |
| recovery_state_restricted | boolean | true if state restricts mutation/release paths   |
| recovery_policy_version  | string  | Governance version                                |

---

## Continuity Mode Catalog

| Mode     | Restricted | Effect on Governed Paths                        |
|----------|------------|-------------------------------------------------|
| normal   | no         | All paths available (subject to other controls) |
| degraded | yes        | Privileged execution proof paths blocked (403)  |
| failover | yes        | Privileged execution proof paths blocked (403)  |

---

## Recovery State Catalog

| State           | Restricted | Effect on Governed Paths                       |
|-----------------|------------|------------------------------------------------|
| standby         | no         | All paths available (subject to other controls)|
| active_recovery | yes        | Mutation/release paths blocked (403)           |
| restored        | no         | All paths restored (subject to other controls) |

---

## Transition Log Entry Schema

| Field  | Type     | Description                              |
|--------|----------|------------------------------------------|
| type   | string   | continuity_mode_change / recovery_state_change |
| from   | string   | Previous mode/state value                |
| to     | string   | New mode/state value                     |
| set_at | ISO 8601 | Transition timestamp                     |
| set_by | string   | Actor ID or "system"                     |

---

## Export Artifact Schema (exportGovernance output)

```json
{
  "exported_at":                   "<ISO 8601>",
  "continuity_dr_version":         "1.0",
  "continuity_mode":               "normal",
  "recovery_state":                "standby",
  "continuity_mode_restricted":    false,
  "recovery_state_restricted":     false,
  "available_continuity_modes":    ["normal", "degraded", "failover"],
  "available_recovery_states":     ["standby", "active_recovery", "restored"],
  "transition_count":              0,
  "transitions":                   []
}
```

---

## Governance Resolution Rules

| Input Condition                            | Result                                          |
|--------------------------------------------|-------------------------------------------------|
| mode recognized, not restricted            | ok: true                                        |
| mode not recognized                        | ok: false, reason: unknown_continuity_mode      |
| mode is degraded or failover               | ok: false, reason: degraded/failover_mode_restriction |
| state recognized, not restricted           | ok: true                                        |
| state not recognized                       | ok: false, reason: unknown_recovery_state       |
| state is active_recovery                   | ok: false, reason: active_recovery_restriction  |
| missing mode or state header               | 403 fail closed                                 |
| incident containment active (P19)          | takes precedence; containment check runs first  |
