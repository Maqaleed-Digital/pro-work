# PROWORK — INCIDENT CONTAINMENT GOVERNANCE SCHEMA

Version: 1.0
Status: ACTIVE
Phase: 19

---

## Incident Entry Schema

| Field                      | Type         | Description                                       |
|----------------------------|--------------|---------------------------------------------------|
| incident_id                | string       | Unique ID (inc_<uuid>)                            |
| incident_status            | string       | active / contained / resolved                     |
| incident_severity          | string       | low / medium / high / critical                    |
| incident_scope             | string       | Free-text scope description (default: "general")  |
| notes                      | string       | Optional notes                                    |
| incident_governance_version| string       | Governance version at declaration time            |
| declared_at                | ISO 8601     | Incident declaration timestamp                    |
| contained_at               | ISO 8601|null | Containment timestamp (null if not yet contained) |
| resolved_at                | ISO 8601|null | Resolution timestamp (null if not yet resolved)   |

---

## Severity Rank Order

| Severity | Rank | Containment Effect                         |
|----------|------|--------------------------------------------|
| low      | 1    | Monitoring only; no route blocking         |
| medium   | 2    | Elevated monitoring; no route blocking     |
| high     | 3    | Sensitive routes restricted                |
| critical | 4    | Privileged execution blocked               |

---

## Status Enforcement

| Status    | Enforces Containment |
|-----------|----------------------|
| active    | yes                  |
| contained | yes                  |
| resolved  | no                   |

---

## Containment Thresholds

| Threshold                  | Min Severity | Governed Effect                         |
|----------------------------|--------------|-----------------------------------------|
| BLOCK_PRIVILEGED_EXECUTION | critical     | Block /api/ops/governed-containment-exec|
| RESTRICT_SENSITIVE_ROUTES  | high         | Restrict sensitive governed routes      |

---

## Export Artifact Schema (exportGovernance output)

```json
{
  "exported_at":                 "<ISO 8601>",
  "incident_governance_version": "1.0",
  "incident_count":              0,
  "active_incident_count":       0,
  "highest_active_severity":     null,
  "containment_active":          false,
  "containment_thresholds": {
    "BLOCK_PRIVILEGED_EXECUTION": "critical",
    "RESTRICT_SENSITIVE_ROUTES":  "high"
  },
  "incidents": []
}
```

---

## Governance Resolution Rules

| Input Condition                               | Result                                    |
|-----------------------------------------------|-------------------------------------------|
| severity recognized                           | ok: true, incident declared               |
| severity not recognized                       | ok: false, reason: unknown_severity       |
| active/contained incident >= critical thresh  | containment blocks privileged exec (403)  |
| active/contained incident >= high thresh      | containment restricts sensitive routes    |
| resolved incident                             | no longer enforces containment            |
| no active/contained incidents                 | containment clear; normal governance      |
