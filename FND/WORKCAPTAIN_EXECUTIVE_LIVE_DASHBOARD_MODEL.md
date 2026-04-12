# WORKCAPTAIN — EXECUTIVE LIVE DASHBOARD MODEL

Status: ACTIVE  
Authority: Phase 65

## 1. Purpose
The executive live dashboard provides a real-time governance posture summary for executive and board-level consumers.

## 2. Dashboard States
- `DASHBOARD_OPERATIONAL` — all critical routes healthy, full evidence chain intact
- `DASHBOARD_WARNING` — runtime posture near threshold, evidence chain intact
- `DASHBOARD_ESCALATED` — prior escalation exists or current posture breaches warning threshold
- `DASHBOARD_BLOCKED` — evidence chain broken or runtime continuity invalid

## 3. Dashboard Inputs
- current mirror sync state
- governance loop output (Phase 64)
- continuous compliance status (Phase 64)
- SLA baseline (Phase 62)
- escalation classification (Phase 63)
- fresh route measurements

## 4. Dashboard Payload Contents
- dashboardState
- sourceOfTruthCommit
- evidenceChain (phase62Dir, phase63Dir, phase64Dir, phase65Dir)
- runtimePosture (deploymentStatus, goLiveCertification, hypercareState, rollbackReady)
- slaPosture (availability, avgLatency, maxLatency, errorRate per critical route)
- compliancePosture (continuousComplianceState)
- loopPosture (governanceLoopState)
- mirrorSyncState
- timestamp
- metadataOnly: true

## 5. Activation Readiness
Activation readiness is:
- `READY` when dashboard state is OPERATIONAL or WARNING
- `REVIEW_REQUIRED` when dashboard state is ESCALATED
- `BLOCKED` when dashboard state is BLOCKED

## 6. Source-of-Truth Rule
All dashboard decisions must reference:
- pushed commit hash
- current evidence directory
- linked Phase 62, 63, 64 evidence directories
