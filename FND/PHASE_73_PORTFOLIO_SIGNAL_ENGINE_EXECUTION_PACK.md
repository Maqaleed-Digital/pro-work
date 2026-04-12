# PHASE 73 — PORTFOLIO SIGNAL ENGINE EXECUTION PACK

Status: ACTIVE_EXECUTION_PACK
Authority: Phase 73
Depends On: Phase 72 advisory_signals.json

## 1. Purpose
Phase 73 activates the portfolio signal engine. It resolves each registered project in portfolio_registry.json, discovers evidence directories per project, and produces portfolio-level operating signals and board intelligence. No runtime state is mutated.

## 2. Objectives
- Read portfolio_registry.json.
- For each registered project, resolve the evidence root path.
- Discover and enumerate evidence directories per project.
- Produce portfolio_registry_resolution.json.
- Produce portfolio_signals.json.
- Produce board_intelligence.json.
- Produce PHASE73_SUMMARY.md.

## 3. Project Resolution Rules
- A project with a resolvable, readable evidence root is marked AVAILABLE.
- A project with a missing or unreadable evidence root is marked UNAVAILABLE.
- UNAVAILABLE projects are recorded with zero evidence dirs and zero signals.
- No error is raised for UNAVAILABLE optional projects.
- Required projects that are UNAVAILABLE cause a BLOCKED portfolio state.

## 4. Hard Rules
- No HTTP calls.
- Fail closed on missing portfolio_registry.json.
- No inferred portfolio signals.
- All signals must derive from discovered evidence files.
- Board intelligence must reflect actual portfolio state, not assumed health.

## 5. Evidence Outputs
- `portfolio_registry_resolution.json`
- `portfolio_signals.json`
- `board_intelligence.json`
- `PHASE73_SUMMARY.md`

## 6. Exit Criteria
Phase 73 is complete when all output files are written with content derived from the portfolio registry and live evidence directory discovery.
