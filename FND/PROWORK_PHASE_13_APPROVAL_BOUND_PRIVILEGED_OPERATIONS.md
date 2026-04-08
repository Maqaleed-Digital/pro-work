# PROWORK — PHASE 13
## Approval-Bound Privileged Operations Layer

Version: 1.0
Status: IMPLEMENTED
Source of Truth Base: d74948863170ebc9e921e32215efa76e05e4608a
Project Identity: ProWork = WorkCaptain

---

## Objective

Move the live permission-enforced, audit-recorded runtime into approval-bound privileged operations. High-risk actions now require a prior explicit approval decision before execution.

Phase 10: route-level RBAC.
Phase 11: permission-bound operational control.
Phase 12: append-only authz audit evidence.
Phase 13: approval-gated maker-checker execution with replay protection.

---

## Implementation Files

| File | Change | Purpose |
|------|--------|---------|
| `app/lib/approval_control.js` | New | Approval catalog, request/decision schemas, maker-checker, validateApproval, consumeApproval, export |
| `app/server.js` | Extended | ApprovalControl import, loadState(), approval routes, ops.override approval gate, ops.force_execute + admin.config_change proof routes |
| `tests/production/phase13_approval_control.test.js` | New | 26 unit tests |
| `scripts/prowork_phase13_approval_bound_privileged_operations.sh` | New | Evidence runner |
| `FND/PROWORK_PHASE_13_APPROVAL_BOUND_PRIVILEGED_OPERATIONS.md` | New | This doc |
| `FND/PROWORK_APPROVAL_CONTROL_SCHEMA.md` | New | Approval schema |
| `FND/PROWORK_APPROVAL_CONTROL_EVIDENCE_CONTRACT.md` | New | Evidence contract |

---

## Approval-Bound Action Catalog

| Action | Maker-Checker | Approver Roles | Requester Roles |
|--------|--------------|----------------|-----------------|
| `ops.override` | yes | superadmin | superadmin, ops |
| `ops.force_execute` | no | superadmin, ops | superadmin, ops |
| `admin.config_change` | yes | superadmin | superadmin |

---

## Approval Flow

```
1. POST /api/approvals/request   {action_type, target_route, reason}
   → 201 {approval_request_id, ...}

2. POST /api/approvals/:id/approve   {reason}
   → 200 {approval_decision_id, decision_outcome: "approved", ...}

3. POST /api/ops/override   {approval_request_id}
   → 202 if valid + not consumed + maker-checker passes
   → 403 if no approval, consumed (replay), self-approve, wrong action type
```

---

## Fail-Closed Rules (All Enforced)

| Condition | Behavior |
|-----------|----------|
| Missing `approval_request_id` | 403 APPROVAL_REQUIRED |
| Unknown approval request | 403 APPROVAL_INVALID: approval_request_not_found |
| No approval decision yet | 403 APPROVAL_INVALID: no_approval_decision |
| Decision outcome is not "approved" | 403 APPROVAL_INVALID: approval_outcome_is_<outcome> |
| Action type mismatch | 403 APPROVAL_INVALID: action_type_mismatch |
| Approval already consumed | 403 APPROVAL_INVALID: approval_already_consumed |
| Maker-checker violation (executor = requester) | 403 APPROVAL_INVALID: maker_checker_violation_executor_is_requester |
| Self-approval of maker-checker action | 403 MAKER_CHECKER_VIOLATION |
| Wrong approver role | 403 FORBIDDEN |
| Auditor requesting approval | 403 FORBIDDEN |

---

## Storage

- `app/data/approval_requests.jsonl` — append-only JSONL, one record per request
- `app/data/approval_decisions.jsonl` — append-only JSONL, one record per decision/event
- In-memory Maps hydrated from JSONL at `ApprovalControl.loadState()` on server startup
- `consumeApproval()` appends a CONSUMED event — consumed IDs never grant execution again

---

## New API Routes

| Method | Route | Permission Required | Approval Required |
|--------|-------|-------------------|------------------|
| POST | `/api/approvals/request` | `ops:status:read` | no |
| POST | `/api/approvals/:id/approve` | `ops:status:read` | no |
| POST | `/api/approvals/:id/deny` | `ops:status:read` | no |
| POST | `/api/ops/force-execute` | `ops:execute` | yes (ops.force_execute) |
| POST | `/api/admin/config-change` | `admin:governance:read` | yes (admin.config_change) |
| POST | `/api/ops/override` | `ops:override` (superadmin only) | yes (ops.override) |
