# WORKCAPTAIN — INTELLIGENCE SIGNAL MODEL

Status: ACTIVE
Authority: Phase 71-73

## 1. Signal Types

### Governance Metrics (Phase 71)
- `total_evidence_dirs`: count of discovered evidence directories across all phases
- `total_evidence_files`: count of all files within discovered evidence directories
- `positive_signal_count`: count of file content hits matching positive governance patterns
- `negative_signal_count`: count of file content hits matching negative governance patterns
- `closure_signal_count`: count of closure-related pattern hits
- `retry_signal_count`: count of retry-related pattern hits
- `reliability_signal_count`: count of reliability-related pattern hits
- `sla_signal_count`: count of SLA-related pattern hits
- `governance_health_ratio`: positive_signal_count / (positive_signal_count + negative_signal_count), or 1.0 if no signals

### Trend Intelligence (Phase 71)
- `phase_sequence`: ordered list of discovered phases with evidence dir counts and file counts
- `evidence_growth_trend`: GROWING / STABLE / DECLINING based on per-phase file counts
- `signal_trend`: IMPROVING / STABLE / DEGRADING based on positive vs negative signal ratio per phase

### Executive KPIs (Phase 71)
- `overall_governance_posture`: HEALTHY / WATCH / DEGRADED based on health ratio thresholds
- `phases_with_evidence`: count of distinct phase numbers with at least one evidence directory
- `total_closure_signals`: sum of closure signal hits across all evidence
- `evidence_density`: average files per evidence directory

## 2. Advisory Severity Levels (Phase 72)
- `INFO`: within normal operating range
- `WATCH`: approaching threshold — monitor
- `ACTION`: threshold crossed — corrective action required
- `CRITICAL`: significantly exceeded threshold — escalation required

## 3. Portfolio States (Phase 73)
- `AVAILABLE`: project evidence root exists and is readable
- `UNAVAILABLE`: project evidence root missing or unreadable
- `PORTFOLIO_HEALTHY`: all required projects AVAILABLE, no CRITICAL signals
- `PORTFOLIO_WATCH`: all required projects AVAILABLE, one or more WATCH signals
- `PORTFOLIO_DEGRADED`: all required projects AVAILABLE, one or more ACTION or CRITICAL signals
- `PORTFOLIO_BLOCKED`: one or more required projects UNAVAILABLE

## 4. Source-of-Truth Rule
All analytics, advisory, and portfolio artifacts must reference:
- execution timestamp
- source evidence root path
- Phase 70 source-of-truth commit hash
