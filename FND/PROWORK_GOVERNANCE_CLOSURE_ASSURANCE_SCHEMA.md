# PROWORK — GOVERNANCE CLOSURE / EXECUTIVE ASSURANCE SCHEMA

Version: 1.0
Status: ACTIVE
Phase: 23

---

## Governance Closure Entry

| Field | Type | Description |
|-------|------|-------------|
| closure_id | string | `cls_<uuid>` — unique identifier |
| closure_scope | string | Scope label; defaults to "global" |
| closure_status | enum | ready \| blocked \| incomplete \| closed |
| tenant_id | string\|null | Tenant scope (optional) |
| jurisdiction_code | string\|null | Jurisdiction scope (optional) |
| critical_evidence_refs | string[] | Required for ready/closed status |
| closure_policy_version | string | Policy version at closure time |
| governance_closure_version | string | Schema version |
| closure_generated_at | ISO8601 | When closure was recorded |

---

## Executive Assurance Pack Entry

| Field | Type | Description |
|-------|------|-------------|
| assurance_pack_id | string | `acp_<uuid>` — unique identifier |
| assurance_scope | string | Scope label; defaults to "global" |
| assurance_status | enum | draft \| validated \| blocked \| issued |
| closure_id | string | Reference to associated governance closure (required) |
| closure_status | string | Status of the referenced closure at pack creation |
| summary_ref | string\|null | Reference to executive summary artifact |
| assurance_pack_version | string | Policy version at pack generation time |
| governance_closure_version | string | Schema version |
| assurance_generated_at | ISO8601 | When assurance pack was recorded |

---

## Status Constants

```
CLOSURE_STATUSES:
  READY      = "ready"
  BLOCKED    = "blocked"
  INCOMPLETE = "incomplete"
  CLOSED     = "closed"

ASSURANCE_STATUSES:
  DRAFT     = "draft"
  VALIDATED = "validated"
  BLOCKED   = "blocked"
  ISSUED    = "issued"
```

---

## Evidence Requirements by Status

| Closure Status | criticalEvidenceRefs Required |
|---------------|-------------------------------|
| ready | Yes — at least one ref |
| blocked | No |
| incomplete | No |
| closed | Yes — at least one ref |

---

## Closure State Snapshot

```json
{
  "closure_count": 0,
  "governance_closure_version": "1.0",
  "closures": [],
  "by_status": {}
}
```

## Assurance Pack State Snapshot

```json
{
  "assurance_pack_count": 0,
  "governance_closure_version": "1.0",
  "assurance_packs": [],
  "by_status": {}
}
```

## Executive Assurance Summary

```json
{
  "summary_generated_at": "<ISO8601>",
  "governance_closure_version": "1.0",
  "overall_assurance_status": "issued|blocked|in_progress|no_packs",
  "closure_count": 0,
  "assurance_pack_count": 0,
  "issued_count": 0,
  "blocked_count": 0,
  "closures_summary": [],
  "packs_summary": []
}
```
