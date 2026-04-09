# WORKCAPTAIN / PROWORK — PHASE 29 REVENUE OPERATIONS CONTROL LAYER + ACTIVE DEAL GOVERNANCE DASHBOARD

Version: 1.0
Status: ACTIVE
Phase: 29
Applies From Commit: b88db37c78b65c0e4f95de8dbdbd8174dc5f1e39

## 1. Purpose

This phase establishes the revenue operations control layer and active deal governance dashboard for WorkCaptain / ProWork.

The objective is to transform the Phase 28 commercial cockpit into a governed revenue operations system that supports:

- active deal visibility
- pipeline control with revenue discipline
- owner-accountable forecasting inputs
- stage-based governance dashboarding
- evidence-backed revenue operations
- escalation-aware revenue execution

## 2. Outcomes

Phase 29 must establish:

- revenue operations control framework
- active deal governance dashboard model
- governed forecast input model
- stage-weighting and confidence model
- revenue review cadence
- active deal risk and blockage model
- dashboard evidence discipline
- revenue decision and escalation workflow

## 3. Preconditions

Phase 29 may proceed only if all of the following are true:

- source-of-truth commit matches approved baseline
- Phase 28 evidence directory exists
- Phase 28 core artifacts exist
- strict Phase 26 evidence validation rule exists
- no critical prerequisite artifact is missing

## 4. Operating Boundary

Phase 29 authorizes revenue operations and dashboard governance only within the existing certified, assurance-bounded, and commercially governed posture.

Phase 29 does not authorize:

- unsupported revenue commitments
- unsupported close-date certainty claims
- unsupported regulatory or legal claims
- third-party certification claims unless separately obtained
- any dashboard statement not backed by stage, owner, and artifact basis

## 5. Required Artifacts

Phase 29 must produce:

- FND/WORKCAPTAIN_PHASE_29_REVENUE_OPERATIONS_CONTROL_LAYER_AND_ACTIVE_DEAL_GOVERNANCE_DASHBOARD.md
- FND/WORKCAPTAIN_REVENUE_OPERATIONS_CONTROL_FRAMEWORK.md
- FND/WORKCAPTAIN_ACTIVE_DEAL_GOVERNANCE_DASHBOARD_MODEL.md
- FND/WORKCAPTAIN_GOVERNED_FORECAST_INPUT_MODEL.md
- FND/WORKCAPTAIN_STAGE_WEIGHTING_AND_CONFIDENCE_MODEL.md
- FND/WORKCAPTAIN_REVENUE_REVIEW_CADENCE.md
- FND/WORKCAPTAIN_ACTIVE_DEAL_RISK_AND_BLOCKAGE_MODEL.md
- FND/WORKCAPTAIN_DASHBOARD_EVIDENCE_DISCIPLINE.md
- FND/WORKCAPTAIN_REVENUE_DECISION_AND_ESCALATION_WORKFLOW.md
- scripts/workcaptain_phase29_revenue_operations_control.sh

## 6. Dashboard Objective

The dashboard must provide a governed operating view where each active deal is:

- identifiable
- owner-assigned
- stage-bound
- forecast-structured
- risk-visible
- evidence-backed
- escalation-aware

## 7. Required Deal Dashboard Fields

Each governed active deal record must include:

- deal_id
- pursuit_category
- owner
- stage
- forecast_band
- confidence_state
- next_action
- artifact_basis
- risk_state
- blockage_state
- escalation_state
- expected_decision_window
- outcome_state

## 8. Fail-Closed Rules

Phase 29 must block if any of the following occurs:

- baseline commit mismatch
- missing Phase 28 evidence
- missing prerequisite artifact
- missing required Phase 29 artifact
- dirty working tree before finalization
- unsupported revenue or certainty claim introduced
- push failure

## 9. Output Contract

The execution script must emit:

- NEW_SOURCE_OF_TRUTH_COMMIT
- EVIDENCE_RUN_DIR
- PHASE29_STATUS
- REVENUE_CONTROL_FRAMEWORK_PATH
- DEAL_GOVERNANCE_DASHBOARD_PATH
- FORECAST_INPUT_MODEL_PATH
- STAGE_WEIGHTING_MODEL_PATH
- REVIEW_CADENCE_PATH
- DEAL_RISK_MODEL_PATH
- DASHBOARD_EVIDENCE_DISCIPLINE_PATH
- REVENUE_ESCALATION_WORKFLOW_PATH

## 10. Non-Negotiable Rule

No governed revenue view may present forecast, confidence, or decision posture without explicit stage, owner, evidence basis, and review cadence.
