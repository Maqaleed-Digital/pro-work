# PROWORK — SOVEREIGN CONTROL REGISTRY SCHEMA

Version: 1.0
Status: ACTIVE
Phase: 14

---

## Registry Entry Schema

| Field            | Type    | Description                                              |
|------------------|---------|----------------------------------------------------------|
| control_key      | string  | Stable dot-notation identifier (e.g. ops.override.requires_approval) |
| control_family   | string  | Family grouping (approval_policy, audit_policy, etc.)    |
| control_version  | string  | Semver of this control definition (e.g. "1.0.0")        |
| status           | string  | One of: active, deprecated, disabled                     |
| value            | any     | Runtime value (boolean true/false or version string)     |
| description      | string  | Human-readable policy description                        |
| source           | string  | Origin (e.g. prowork.phase14)                            |
| created_at       | string  | ISO 8601 UTC timestamp                                   |
| evidence_version | string  | Registry schema version at entry creation                |

---

## Export Artifact Schema (exportRegistry output)

```json
{
  "exported_at":      "<ISO 8601>",
  "registry_version": "1.0",
  "control_count":    7,
  "entries": [ ... ]
}
```

---

## Status Values (STATUSES)

| Constant    | String value  |
|-------------|---------------|
| ACTIVE      | active        |
| DEPRECATED  | deprecated    |
| DISABLED    | disabled      |

---

## Override File Format (app/data/sovereign_registry.json)

The override file may be an array of partial entry objects, or an object with an
`entries` array. Only `status` and `value` fields are merged from the file.
Unknown keys in the file are silently ignored (fail-closed default).

```json
[
  { "control_key": "ops.override.requires_approval", "status": "active", "value": true }
]
```
