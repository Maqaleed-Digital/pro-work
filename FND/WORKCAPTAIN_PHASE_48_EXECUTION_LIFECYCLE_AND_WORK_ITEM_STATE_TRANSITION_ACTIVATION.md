# WORKCAPTAIN / PROWORK — PHASE 48
## Execution Lifecycle + Work Item State Transition Activation

Status: ACTIVE
Source-of-truth input commit: 3ebf7e0f817fddc5a9dd51e0db6ec47fc85e1ac7
Execution model: Option C (Hybrid)

## Purpose
Phase 48 expands governed casework into active execution lifecycle movement.

This phase introduces:
- governed work item lifecycle transitions
- start / block / complete actions for work items
- execution queue movement based on persisted lifecycle state
- command-center execution progress summaries
- lifecycle event emission for accountability
- browser demo for work item execution state movement

## Multi-flow scope
Flow A: INTAKE_CREATED → OPPORTUNITY_REGISTERED → COMMAND_CENTER_STATE_UPDATED
Flow B: OPPORTUNITY_STAGE_ADVANCED → BOARD_QUEUE_STATE_UPDATED
Flow C: APPROVAL_RECORDED → OPPORTUNITY_APPROVED → DECISION_AUDIT_UPDATED
Flow D: WORK_ITEM_CREATED → EXECUTION_QUEUE_UPDATED → COMMAND_CENTER_CASEWORK_UPDATED
Flow E: WORK_ITEM_STARTED → EXECUTION_QUEUE_UPDATED → EXECUTION_PROGRESS_UPDATED
Flow F: WORK_ITEM_BLOCKED → EXECUTION_QUEUE_UPDATED → EXECUTION_PROGRESS_UPDATED
Flow G: WORK_ITEM_COMPLETED → EXECUTION_QUEUE_UPDATED → EXECUTION_PROGRESS_UPDATED

## Mandatory runtime rules
- Only board_operator may execute lifecycle transitions
- Start allowed only from READY
- Block allowed only from READY or IN_PROGRESS
- Complete allowed only from IN_PROGRESS
- Completed and blocked work items leave execution queue
- Invalid lifecycle actions remain fail-closed
