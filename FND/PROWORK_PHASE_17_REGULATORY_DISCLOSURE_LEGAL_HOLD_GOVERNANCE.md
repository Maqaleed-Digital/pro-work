# PROWORK — PHASE 17: REGULATORY DISCLOSURE + LEGAL HOLD GOVERNANCE LAYER

Version: 1.0
Status: ACTIVE
Phase: 17
Source of Truth Base: a97d5532e96b2083a1f1ad9590985d49ea09a86e

---

## Objective

Extend the Phase 16 data residency/retention runtime with regulatory disclosure basis
enforcement and in-memory legal hold governance. Every governed disclosure action must
resolve a valid disclosure basis (active, in-scope) before proceeding. Every governed
disposal/lifecycle action must validate the declared legal hold state and verify no active
hold is registered for the tenant. Missing, unknown, or out-of-scope basis/state fails
closed (403). An active legal hold blocks disposal regardless of other context.

---

## Architecture

Phase 17 is **additive**. All Phase 10–16 controls remain intact. Phase 17 adds the
disclosure/legal-hold layer as independent governance checks on two new proof routes:

```
governed-disclosure:
  authenticate → permission check → disclosure basis check → scope check → execute (202)

governed-disposal:
  authenticate → permission check → tenant check → hold state validation → active hold check → execute (202)
```

---

## New Module: app/lib/disclosure_legal_hold.js

### Disclosure Basis Catalog

| Basis                  | Name                  | Status | Policy Version |
|------------------------|-----------------------|--------|----------------|
| regulatory.request     | Regulatory Request    | active | 1.0            |
| customer.disclosure    | Customer Disclosure   | active | 1.0            |
| internal.audit.review  | Internal Audit Review | active | 1.0            |

### Disclosure Scope Catalog

| Scope            | Description                              |
|------------------|------------------------------------------|
| audit_records    | Authorization audit records only         |
| approval_records | Approval request and decision records    |
| full_export      | Complete governed evidence export        |

### Scope Allowance Matrix

| Basis                  | Permitted Scopes                                   |
|------------------------|----------------------------------------------------|
| regulatory.request     | audit_records, approval_records, full_export       |
| customer.disclosure    | audit_records, approval_records                    |
| internal.audit.review  | audit_records                                      |

### Legal Hold States

| State    | Meaning                                     |
|----------|---------------------------------------------|
| none     | No hold declared by requester               |
| active   | Active hold declared by requester           |
| released | Previously held, now released               |

### Functions

| Function                               | Description                                              |
|----------------------------------------|----------------------------------------------------------|
| resolveDisclosureBasis(basis)          | Fail-closed: unknown/inactive → {ok:false}               |
| validateDisclosureScope(basis, scope)  | Fail-closed: unknown scope or out of basis allowance     |
| validateLegalHoldState(declaredState)  | Fail-closed: unknown state string                        |
| createLegalHold({tenantId,scope,note}) | Register new active hold; returns {ok, data}             |
| hasActiveLegalHold(tenantId)           | Returns true if tenant has at least one active hold      |
| getLegalHoldsForTenant(tenantId)       | Returns all hold entries for tenant                      |
| releaseLegalHold(legalHoldId)          | Transition ACTIVE → RELEASED                             |
| getGovernanceState()                   | Read-only snapshot {bases, scopes, legal_holds}          |
| exportGovernance(outputPath?)          | JSON artifact, no state mutation                         |

---

## New Server Routes

### Admin — superadmin (OPS_OVERRIDE permission) only

| Method | Route                                                                  | Name                                          |
|--------|------------------------------------------------------------------------|-----------------------------------------------|
| GET    | /api/admin/disclosure-governance                                        | disclosure.governance.list                    |
| GET    | /api/admin/disclosure-governance/export                                 | disclosure.governance.export                  |
| GET    | /api/admin/disclosure-governance/bases                                  | disclosure.governance.bases                   |
| GET    | /api/admin/disclosure-governance/legal-holds                            | disclosure.governance.legal_holds             |
| POST   | /api/admin/disclosure-governance/legal-hold                             | disclosure.governance.legal_hold.create       |
| POST   | /api/admin/disclosure-governance/legal-hold/:id/release                 | disclosure.governance.legal_hold.release      |

### Governed Proof Routes

| Method | Route                          | Required Headers                                      |
|--------|--------------------------------|-------------------------------------------------------|
| POST   | /api/ops/governed-disclosure   | X-Disclosure-Basis, X-Disclosure-Scope                |
| POST   | /api/ops/governed-disposal     | X-Tenant-Id, X-Legal-Hold-State                       |

---

## Fail-Closed Rules

| Condition                             | HTTP Code | Error Code                    |
|---------------------------------------|-----------|-------------------------------|
| Missing X-Disclosure-Basis            | 403       | DISCLOSURE_REQUIRED           |
| Unknown/inactive disclosure basis     | 403       | DISCLOSURE_DENIED             |
| Scope out of basis allowance          | 403       | DISCLOSURE_SCOPE_DENIED       |
| Missing X-Legal-Hold-State            | 403       | LEGAL_HOLD_STATE_REQUIRED     |
| Unknown legal hold state              | 403       | LEGAL_HOLD_STATE_DENIED       |
| Active legal hold exists for tenant   | 403       | LEGAL_HOLD_ACTIVE             |

---

## Logging

All governed disclosure/disposal actions log relevant governance metadata. Events:
- `disclosure.governance.resolved`
- `disclosure.scope.resolved`
- `disclosure.governance.missing_basis`
- `legal.hold.state.validated`
- `legal.hold.state.missing`
- `legal.hold.checked`
- `governed.disclosure.accepted`
- `governed.disposal.accepted`
