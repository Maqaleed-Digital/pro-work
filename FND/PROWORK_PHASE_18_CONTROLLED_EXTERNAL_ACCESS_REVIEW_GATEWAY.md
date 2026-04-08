# PROWORK — PHASE 18: CONTROLLED EXTERNAL ACCESS + REGULATOR/THIRD-PARTY REVIEW GATEWAY

Version: 1.0
Status: ACTIVE
Phase: 18
Source of Truth Base: 3f8026c

---

## Objective

Extend the Phase 17 disclosure/legal-hold-governed runtime with a controlled external
review gateway for regulators and third-party reviewers. Every governed external read or
export path must resolve a valid, active review session with matching scope, tenant, and
jurisdiction context before proceeding. Missing, expired, revoked, or mismatched sessions
fail closed (403). Mutation through the external gateway is unconditionally denied.

---

## Architecture

Phase 18 is **additive**. All Phase 10–17 controls remain intact. Phase 18 adds the
external review gateway as a session-gated, scope-checked, read-only layer:

```
external review paths:
  session resolve → reviewer type check → scope check →
  cross-tenant check → jurisdiction check →
  [disclosure basis check] → [legal hold check] → execute (200)
```

---

## New Module: app/lib/external_review_gateway.js

### Reviewer Type Catalog

| Type                 | Description                                 |
|----------------------|---------------------------------------------|
| regulator            | Regulatory authority reviewer               |
| third_party_auditor  | Independent third-party auditor             |
| customer_reviewer    | Customer reviewing their own governed data  |

### Review Scope Catalog (read-only only)

| Scope                   | Description                                        |
|-------------------------|----------------------------------------------------|
| evidence.read           | Read governed evidence records                     |
| audit.read              | Read authorization audit records                   |
| disclosure.export.read  | Read/export disclosure-bound governed evidence     |

### Review Status Values

| Status   | Meaning                                         |
|----------|-------------------------------------------------|
| active   | Session is valid and usable                     |
| expired  | Session has passed its expires_at timestamp     |
| revoked  | Session has been explicitly revoked by admin    |
| consumed | Session has been used (one-time use pattern)    |

### Jurisdiction Compatibility Matrix

| Session Jurisdiction | Accepted Request Jurisdictions |
|----------------------|-------------------------------|
| KSA                  | KSA, GLOBAL                   |
| GCC                  | KSA, GCC, GLOBAL              |
| GLOBAL               | KSA, GCC, GLOBAL (all)        |

### Functions

| Function                                         | Description                                              |
|--------------------------------------------------|----------------------------------------------------------|
| validateReviewerType(reviewerType)               | Fail-closed: unknown → {ok:false}                        |
| validateReviewScope(sessionScope, requiredScope) | Fail-closed: mismatch/unknown → {ok:false}               |
| validateCrossTenant(sessionTenantId, requestId)  | Fail-closed: cross-tenant → {ok:false}                   |
| validateJurisdictionCompatibility(req, ses)      | Fail-closed: incompatible → {ok:false}                   |
| createReviewSession({reviewerType,...})           | Register new active session; returns {ok, data}          |
| resolveReviewSession(sessionId)                  | Fail-closed: unknown/expired/revoked/consumed → {ok:false}|
| revokeReviewSession(sessionId)                   | Transition ACTIVE → REVOKED                              |
| consumeReviewSession(sessionId)                  | Transition ACTIVE → CONSUMED                             |
| getGatewayState()                                | Read-only snapshot {reviewer_types, review_scopes, review_sessions} |
| exportGateway(outputPath?)                       | JSON artifact, no state mutation                         |

---

## New Server Routes

### Admin — superadmin (OPS_OVERRIDE permission) only

| Method | Route                                                    | Name                                |
|--------|----------------------------------------------------------|-------------------------------------|
| GET    | /api/admin/external-review/export                        | external.review.export              |
| POST   | /api/admin/external-review/sessions                      | external.review.session.create      |
| POST   | /api/admin/external-review/sessions/:id/revoke           | external.review.session.revoke      |

### External Review Proof Routes (session-gated, read-only)

| Method | Route                              | Required Headers                                              |
|--------|------------------------------------|---------------------------------------------------------------|
| GET    | /external-review/evidence          | X-Review-Session-Id, X-Tenant-Id, X-Jurisdiction-Code        |
| GET    | /external-review/audit             | X-Review-Session-Id, X-Tenant-Id, X-Jurisdiction-Code        |
| GET    | /external-review/disclosure-export | X-Review-Session-Id, X-Tenant-Id, X-Jurisdiction-Code        |
| POST   | /external-review/mutation-test     | (always denied — mutation not permitted through gateway)      |

---

## Fail-Closed Rules

| Condition                             | HTTP Code | Error Code                           |
|---------------------------------------|-----------|--------------------------------------|
| Missing X-Review-Session-Id           | 403       | EXTERNAL_REVIEW_SESSION_REQUIRED     |
| Unknown session                       | 403       | EXTERNAL_REVIEW_SESSION_DENIED       |
| Expired session                       | 403       | EXTERNAL_REVIEW_SESSION_DENIED       |
| Revoked session                       | 403       | EXTERNAL_REVIEW_SESSION_DENIED       |
| Consumed session                      | 403       | EXTERNAL_REVIEW_SESSION_DENIED       |
| Unknown reviewer type                 | 403       | EXTERNAL_REVIEW_REVIEWER_DENIED      |
| Scope mismatch                        | 403       | EXTERNAL_REVIEW_SCOPE_DENIED         |
| Cross-tenant access                   | 403       | EXTERNAL_REVIEW_CROSS_TENANT         |
| Incompatible jurisdiction             | 403       | EXTERNAL_REVIEW_JURISDICTION_DENIED  |
| Missing disclosure basis (export)     | 403       | EXTERNAL_REVIEW_DISCLOSURE_REQUIRED  |
| Invalid disclosure basis (export)     | 403       | EXTERNAL_REVIEW_DISCLOSURE_DENIED    |
| Active legal hold (export)            | 403       | EXTERNAL_REVIEW_LEGAL_HOLD_ACTIVE    |
| Mutation through gateway              | 403       | EXTERNAL_REVIEW_MUTATION_DENIED      |

---

## Logging

All external review path resolutions log reviewer and session metadata. Events:
- `external.review.session.resolved`
- `external.review.reviewer_type.denied`
- `external.review.scope.checked`
- `external.review.tenant.checked`
- `external.review.jurisdiction.checked`
- `external.review.disclosure.resolved`
- `external.review.legal_hold.checked`
- `external.review.evidence.accessed`
- `external.review.audit.accessed`
- `external.review.disclosure_export.accessed`
- `external.review.mutation.denied`
