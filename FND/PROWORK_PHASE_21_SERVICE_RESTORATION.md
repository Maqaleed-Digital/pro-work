# PROWORK — PHASE 21: Controlled Service Restoration + Post-Incident Assurance

Version: 1.0
Status: ACTIVE
Phase: 21
Depends-On: Phase 19 (Incident Containment), Phase 20 (Business Continuity / DR)

---

## Overview

Phase 21 establishes governed service restoration after incidents or continuity events. No service restoration proceeds without explicit approval. Post-restoration assurance must be verified before marking a restoration complete. Unverified or failed-assurance restorations cannot transition to completed state.

---

## Restoration Lifecycle

```
pending → in_progress → validated → completed
              ↑               (verified assurance)
              └── (failed assurance reverts to pending)
```

| Status | Description |
|--------|-------------|
| pending | Created; awaiting phase application |
| in_progress | Phase applied; restoration underway |
| validated | Assurance verified; cleared for completion |
| completed | Restoration fully complete |

---

## Assurance Lifecycle

| Status | Description |
|--------|-------------|
| pending | Default; assurance not yet run |
| verified | Assurance passed; restoration validated |
| failed | Assurance failed; restoration reverted to pending |

---

## Governance Rules

1. **No restoration without approval**: `approvedBy` is required. Missing or empty → `missing_approval`.
2. **Fail-closed on unknown ID**: Any operation on an unknown `restoration_id` → `unknown_restoration_id`.
3. **Fail-closed on missing context**: Missing `restoration_id` → `missing_restoration_id`.
4. **Phase transition is strict**: `applyRestorationPhase` only on `pending` → `invalid_status_for_phase`.
5. **Assurance start requires in_progress**: `startAssurance` only on `in_progress` → `invalid_status_for_assurance`.
6. **Assurance verification requires in_progress**: `verifyAssurance` only on `in_progress` → `invalid_status_for_verification`.
7. **Failed assurance reverts to pending**: Not a dead state — restoration can be re-applied and retried.
8. **Completion requires validated status**: `completeRestoration` only on `validated` → `assurance_not_verified`.
9. **Governed execution requires validated or completed restoration**: `X-Restoration-Id` header must reference a validated/completed restoration.

---

## API Routes

| Method | Route | Role | Description |
|--------|-------|------|-------------|
| POST | /api/admin/restorations | superadmin | Initiate restoration (requires approved_by) |
| POST | /api/admin/restorations/:id/phase | superadmin | Apply restoration phase (pending → in_progress) |
| POST | /api/admin/restorations/:id/assurance/start | superadmin | Mark assurance as started |
| POST | /api/admin/restorations/:id/assurance/verify | superadmin | Verify assurance (passed/failed) |
| POST | /api/admin/restorations/:id/complete | superadmin | Complete restoration (validated → completed) |
| GET | /api/admin/restorations/export | superadmin/auditor | Export restoration governance artifact |
| POST | /api/ops/governed-restoration-exec | ops | Execute governed operation (requires validated restoration) |

---

## Resolution Chain Position

Phase 21 adds restoration governance as the final check in the governed execution chain:

```
authenticate → permission → tenant → jurisdiction → residency → retention
→ disclosure → legal hold → external review → incident containment
→ continuity/DR → restoration (Phase 21)
```
