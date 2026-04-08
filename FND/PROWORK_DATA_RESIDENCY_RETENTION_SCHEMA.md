# PROWORK — DATA RESIDENCY / RETENTION GOVERNANCE SCHEMA

Version: 1.0
Status: ACTIVE
Phase: 16

---

## Data Residency Entry Schema

| Field          | Type   | Description                                         |
|----------------|--------|-----------------------------------------------------|
| region         | string | Canonical code: KSA, GCC, GLOBAL                    |
| name           | string | Human-readable name                                 |
| status         | string | active or inactive                                  |
| policy_version | string | Residency policy version (e.g. "1.0")               |
| description    | string | Scope description                                   |

---

## Evidence Retention Class Schema

| Field           | Type   | Description                                        |
|-----------------|--------|----------------------------------------------------|
| retention_class | string | Dot-notation class (e.g. audit.short_term)          |
| name            | string | Human-readable name                                |
| status          | string | active or inactive                                 |
| retention_days  | number | Days to retain; -1 means indefinite                |
| policy_version  | string | Retention policy version (e.g. "1.0")              |
| description     | string | Description                                        |

---

## Residency Compatibility Matrix

| Jurisdiction | Accepted Residency Regions     |
|-------------|--------------------------------|
| KSA         | KSA, GLOBAL                    |
| GCC         | KSA, GCC, GLOBAL               |
| GLOBAL      | KSA, GCC, GLOBAL (all)         |

GLOBAL residency always passes.
GLOBAL jurisdiction accepts any known region.

---

## Export Artifact Schema (exportGovernance output)

```json
{
  "exported_at":                 "<ISO 8601>",
  "evidence_governance_version": "1.0",
  "residency_region_count":      3,
  "retention_class_count":       4,
  "residency_regions":           [ ... ],
  "retention_classes":           [ ... ]
}
```

---

## Governance Resolution Rules

| Input Condition                               | Result                                |
|-----------------------------------------------|---------------------------------------|
| region recognized, status=active              | ok: true                              |
| region not recognized                         | ok: false, reason: unknown_region     |
| region empty/null                             | ok: false, reason: missing_region     |
| retention_class recognized, status=active     | ok: true                              |
| retention_class not recognized                | ok: false, reason: unknown_retention_class |
| retention_class inactive (overridden)         | ok: false, reason: inactive_retention_class |
| GLOBAL residency request                      | always compatible                     |
| residency incompatible with jurisdiction      | ok: false, reason: incompatible_residency |
