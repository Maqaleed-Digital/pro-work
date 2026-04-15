# WORKCAPTAIN — S28 P0 CLOSURE MATRIX

Version: 1.0  
Status: LOCKED  

---

## 1. GAP-TO-DELIVERABLE MATRIX

| Gap | Required Closure | Evidence File |
|---|---|---|
| Command Center missing | Decision OS homepage with KPI + risk + AI + quick actions | ROUTE_SURFACE_MATRIX.md |
| AI UI missing | /ai with rationale, confidence, approval, override capture | AI_EXPLAINABILITY_MATRIX.md |
| Compliance UI missing | /compliance with WPS, probation, compliance status, alerts | COMPLIANCE_SURFACE_MATRIX.md |
| Evidence UI missing | /evidence with pack list, viewer, timeline, export path | EVIDENCE_SURFACE_MATRIX.md |
| Payments visibility weak | /payments with escrow, payout, fee, release visibility | FINANCIAL_SURFACE_MATRIX.md |
| PDPL layer weak | consent / export / redaction / DSR visibility | PDPL_SURFACE_MATRIX.md |
| Externalization weak | route coverage + role navigation + tenant-safe exposure | GOVERNANCE_CLOSURE.md |

---

## 2. ROUTE CONTRACT

| Route | Minimum Required Outcome |
|---|---|
| / | Command Center with KPI strip, risk strip, AI strip, quick actions |
| /workforce | Existing workforce view wired into new command navigation |
| /execution | Execution state reachable from command center |
| /ai | Explainable recommendation surface |
| /compliance | Sovereign compliance visibility surface |
| /evidence | Evidence + audit surface |
| /payments | Financial operations visibility surface |
| /identity | Identity placeholder or initial surface linked to ERI / future tokens |
| /admin | Policy / tenant / control access retained |

---

## 3. HARD RULES

1. No silent AI action.
2. No hidden compliance state.
3. No evidence generation without evidence discoverability.
4. No visible sovereign promise without actual UI pathway.
5. No closure without evidence pack.

---

## 4. CLOSURE CHECKLIST

- All routes render
- Navigation reaches all routes
- Major cards have loading / empty / error states
- AI cards show rationale + confidence + approval action
- Compliance cards show alert / due / resolved states
- Evidence cards show timeline / export entry
- Payments show fee / escrow / payout status
- Privacy surface shows consent / export / redaction entry
- Arabic/RTL readiness reviewed
- Evidence directory created
- Commit pushed
- Pushed commit hash recorded as source of truth
