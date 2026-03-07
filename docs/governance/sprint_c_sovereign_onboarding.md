# PROWORK — Sprint C / Sovereign Onboarding

## Status
COMPLETE

## Baseline
- Phase 1: 5ff7de2
- Sprint A (WOS Core): f53327c
- Sprint B (Sovereign Recruiting): b5c8a62

## Scope
Full onboarding lifecycle for hired workers in the KSA context:

| Service | Operations | Trust Level |
|---------|-----------|-------------|
| checklist_service | startOnboarding, createChecklistItem, completeChecklistItem | STANDARD |
| document_service | createDocument, verifyDocument | verifyDocument → HIGH |
| contract_service | draftContract, transitionContract (FSM) | SIGNED / ACTIVATED → HIGH |
| consent_service | acknowledgeConsent | STANDARD |
| compliance_service | captureIban, generateWpsReadiness | WPS → HIGH |
| probation_service | openProbationCase, generateDay80Pack, recordDecision | day80 / decision → HIGH |

## Events Registered (Sprint C)

| Event | trust_sensitive | Notes |
|-------|----------------|-------|
| ONBOARDING_STARTED | false | Emitted by startOnboarding |
| ONBOARDING_CHECKLIST_ITEM_COMPLETED | false | Item completion signal |
| DOCUMENT_VERIFIED | **true** | KYC/ID verification |
| IBAN_CAPTURED | false | Bank details capture |
| WPS_READINESS_GENERATED | **true** | Wage Protection System artifact |
| CONTRACT_DRAFTED | false | Draft emission |
| CONTRACT_SIGNED | **true** | Worker signature |
| CONTRACT_ACTIVATED | **true** | HR activation |
| CONSENT_ACKNOWLEDGED | false | PDPL consent |
| PROBATION_PACK_GENERATED | **true** | Day-80 evidence pack |
| PROBATION_DECISION_RECORDED | **true** | CONFIRM / EXTEND / TERMINATE |

## Contract FSM
```
DRAFT → REVIEW → SIGNED → ACTIVATED
DRAFT → SIGNED (skip review)
REVIEW → DRAFT (return to draft)
```

## Evidence Pack Targets
- EP-WOS-ONBOARD-01: WPS readiness + document verification chain
- EP-WOS-PROB-01: Day-80 probation pack + decision record

## Constraints
- No payroll execution in this sprint
- All HIGH trust events require human approval before downstream action
- Evidence is mandatory for closure
- Policy rules (KSA Labour Law, PDPL, Nitaqat) remain configurable
