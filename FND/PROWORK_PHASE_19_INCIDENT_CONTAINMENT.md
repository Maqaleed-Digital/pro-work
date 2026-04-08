# PROWORK — PHASE 19: BREACH RESPONSE + INCIDENT CONTAINMENT GOVERNANCE LAYER

Version: 1.0
Status: ACTIVE
Phase: 19
Source of Truth Base: d3f444d

---

## Objective

Extend the Phase 18 external review gateway runtime with governed breach response and
incident containment. When a critical incident is declared, privileged execution routes
fail closed. When a high-severity incident is active, sensitive routes are restricted.
Containment is additive over all prior governance layers — all prior controls remain fully
active. Incident state is machine-readable, auditable, and exportable.

---

## Architecture

Phase 19 is **additive and fail-closed**. All Phase 10–18 controls remain intact. Phase 19
adds incident governance as an orthogonal containment gate applied after authentication and
permission checks:

```
governed-containment-exec proof route:
  authenticate → permission check → containment check (P19) → execute (202)
  
containment check (critical severity):
  hasActiveIncidentAtOrAbove("critical") → blocked (403) | clear (proceed)
```

---

## New Module: app/lib/incident_registry.js

### Severity Catalog

| Severity | Rank | Description                                |
|----------|------|--------------------------------------------|
| low      | 1    | Minor issue; monitoring only               |
| medium   | 2    | Elevated risk; limited controls applied    |
| high     | 3    | Significant risk; sensitive routes restricted |
| critical | 4    | Severe breach; privileged execution blocked |

### Status Values

| Status    | Enforcing | Description                              |
|-----------|-----------|------------------------------------------|
| active    | yes       | Incident actively enforcing containment  |
| contained | yes       | Controlled but not yet resolved          |
| resolved  | no        | Cleared; containment no longer applies   |

### Containment Thresholds

| Threshold                  | Min Severity | Action                              |
|----------------------------|--------------|-------------------------------------|
| BLOCK_PRIVILEGED_EXECUTION | critical     | Block governed privileged exec routes|
| RESTRICT_SENSITIVE_ROUTES  | high         | Restrict sensitive governed routes  |

### Functions

| Function                              | Description                                                |
|---------------------------------------|------------------------------------------------------------|
| declareIncident({severity,scope,notes}) | Register new active incident; fail-closed on unknown severity |
| containIncident(incidentId)           | Transition ACTIVE → CONTAINED                              |
| resolveIncident(incidentId)           | Transition any enforcing status → RESOLVED                 |
| getActiveIncidents()                  | Returns all ACTIVE/CONTAINED incidents                     |
| hasActiveIncidentAtOrAbove(severity)  | Containment check: true if any enforcing incident >= threshold |
| getHighestActiveSeverity()            | Returns highest severity among enforcing incidents         |
| getGovernanceState()                  | Read-only snapshot                                         |
| exportGovernance(outputPath?)         | JSON artifact, no state mutation                           |

---

## New Server Routes

### Admin — superadmin (OPS_OVERRIDE permission) only

| Method | Route                                         | Name                  |
|--------|-----------------------------------------------|-----------------------|
| GET    | /api/admin/incidents/export                   | incidents.export      |
| POST   | /api/admin/incidents                          | incidents.declare     |
| POST   | /api/admin/incidents/:id/contain              | incidents.contain     |
| POST   | /api/admin/incidents/:id/resolve              | incidents.resolve     |

### Containment-Gated Proof Route

| Method | Route                              | Required Headers |
|--------|------------------------------------|------------------|
| POST   | /api/ops/governed-containment-exec | Authorization    |

---

## Fail-Closed Rules

| Condition                                    | HTTP Code | Error Code         |
|----------------------------------------------|-----------|--------------------|
| Active critical incident on privileged exec  | 403       | CONTAINMENT_ACTIVE |
| Unknown incident severity                    | 422       | INCIDENT_ERROR     |
| Unknown incident ID (contain/resolve)        | 422       | INCIDENT_ERROR     |
| Already resolved incident                    | 422       | INCIDENT_ERROR     |

---

## Logging

All containment check decisions are logged with incident metadata. Events:
- `containment.checked`
- `incident.declared`
- `incident.contained`
- `incident.resolved`
- `incidents.exported`
- `governed.containment_exec.accepted`
