# WORKCAPTAIN / PROWORK — PHASE 52
## Board Assurance Dashboard + Governed Portfolio Closure Visibility

Status: ACTIVE
Mode: INTEGRATION-ENFORCED

## Purpose
Phase 52 introduces executive-level assurance visibility by projecting:
- opportunities
- work items
- delivery artifacts
- evidence packs
- certifications

into a unified **board assurance dashboard**

## Key capabilities
- portfolio closure aggregation
- certification-based assurance scoring
- closure completeness projection
- board-level visibility routes
- event-driven assurance updates

## Integration rule
- MUST consume existing runtime state (Phase 50 + 51)
- MUST NOT duplicate state or introduce parallel models
- MUST derive from persisted records and emitted events only
- MUST fail-closed if upstream state unavailable

## Routes
- GET /api/board/assurance
- GET /api/board/assurance/:opportunityId
- GET /api/board/portfolio/closure-summary

## Acceptance
- dashboard reflects live runtime state
- certification totals align with Phase 51
- closure completeness is deterministic
- no missing upstream linkage allowed
