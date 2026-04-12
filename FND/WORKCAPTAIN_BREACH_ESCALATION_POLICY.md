# WORKCAPTAIN — BREACH ESCALATION POLICY

Status: ACTIVE  
Authority: Phase 63

## 1. Principle
Every breach response must be evidence-derived, severity-classified, and reviewable.

## 2. Severity Levels
- `SEV0_INFO`
- `SEV1_WARNING`
- `SEV2_MAJOR`
- `SEV3_CRITICAL`

## 3. Classification Rules
### SEV0_INFO
- no breach
- all critical routes pass
- review continues under normal cadence

### SEV1_WARNING
- no hard SLA breach
- one or more routes trend near threshold
- operator review required in next cadence cycle

### SEV2_MAJOR
- one or more routes fail SLA thresholds
- runtime remains reachable
- escalation record required
- daily review cadence elevated

### SEV3_CRITICAL
- repeated failures or route unreachability on critical governance paths
- immediate escalation required
- operator review required before any operational success claim

## 4. Escalation Actions
### For SEV0_INFO
- continue normal cadence
- retain latest evidence pack

### For SEV1_WARNING
- flag route in review snapshot
- tighten monitoring on next run
- preserve warning evidence

### For SEV2_MAJOR
- create escalation actions record
- mark operational posture degraded
- require operator acknowledgement
- preserve all metrics and response captures

### For SEV3_CRITICAL
- create escalation actions record
- mark operational posture breach-controlled pending review
- require immediate operator review
- preserve all metrics and response captures
- no success claim permitted

## 5. Non-Negotiables
- no manual severity override inside execution script
- no silent closure of breach state
- no escalation claim without classification evidence
