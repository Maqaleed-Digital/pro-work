#!/usr/bin/env python3
"""
Phase 74 — Governance Recovery + Critical Signal Remediation + Portfolio Stabilization
Reads Phase 71-73 evidence, derives recovery drivers, produces remediation and stabilization artifacts.
No HTTP calls. Pure analytics.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def priority_from_high_metric(value, cfg):
    if value > cfg["p0_gt"]:
        return "P0_IMMEDIATE"
    if value > cfg["p1_gt"]:
        return "P1_URGENT"
    if value > cfg["p2_gt"]:
        return "P2_CONTROLLED"
    return "P3_MONITOR"


def priority_from_low_metric(value, cfg):
    if value < cfg["p0_lt"]:
        return "P0_IMMEDIATE"
    if value < cfg["p1_lt"]:
        return "P1_URGENT"
    if value < cfg["p2_lt"]:
        return "P2_CONTROLLED"
    return "P3_MONITOR"


PHASE_DIR_RE = re.compile(r"phase\d+.*?(\d{8}T\d{6}Z)")


def latest_phase_velocity_days(prior_dir):
    """
    Derive phase_velocity_days_latest from the prior evidence dir's embedded timestamp.
    The dir name pattern is phase<N>_<YYYYMMDDTHHMMSSZ>.
    Returns days between that timestamp and now.
    """
    m = PHASE_DIR_RE.search(str(prior_dir))
    if not m:
        return 0.0
    ts_str = m.group(1)
    try:
        ts = datetime.strptime(ts_str, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        delta = now - ts
        return round(delta.total_seconds() / 86400, 4)
    except Exception:
        return 0.0


def compute_gate_negative_rate(gm):
    """Compute negative signal rate from governance_metrics positive/negative signal counts."""
    pos = gm.get("positive_signal_count", 0)
    neg = gm.get("negative_signal_count", 0)
    total = pos + neg
    if total == 0:
        return 0.0
    return round(neg / total, 4)


def compute_portfolio_coverage_ratio(board):
    """Derive coverage ratio from board_intelligence available vs registered projects."""
    registered = board.get("registered_projects", 0)
    available = board.get("available_projects", 0)
    if registered == 0:
        return 0.0
    return round(available / registered, 4)


def derive_board_signal_severity(portfolio_state):
    """Map portfolio_state to a board signal severity string."""
    mapping = {
        "PORTFOLIO_HEALTHY": "INFO",
        "PORTFOLIO_WATCH": "WATCH",
        "PORTFOLIO_DEGRADED": "ACTION",
        "PORTFOLIO_BLOCKED": "CRITICAL",
    }
    return mapping.get(portfolio_state, "WATCH")


def build_coverage_disclosure(board):
    registered = board.get("registered_projects", 0)
    available = board.get("available_projects", 0)
    unavailable = board.get("unavailable_projects", 0)
    return (
        f"{available}/{registered} projects available; "
        f"{unavailable} unavailable projects excluded from portfolio analytics."
    )


def main():
    if len(sys.argv) != 4:
        print(
            "usage: workcaptain_phase74_recovery.py "
            "<prior_evidence_dir> <output_evidence_dir> <recovery_thresholds_json>",
            file=sys.stderr,
        )
        sys.exit(1)

    prior_dir = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    thresholds_path = Path(sys.argv[3]).resolve()

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print(f"Phase 74 Recovery — prior evidence: {prior_dir}")

    # Hard-fail on missing inputs
    for req in [
        "governance_metrics.json",
        "trend_intelligence.json",
        "executive_kpis.json",
        "advisory_signals.json",
        "advisory_recommendations.json",
        "portfolio_registry_resolution.json",
        "portfolio_signals.json",
        "board_intelligence.json",
    ]:
        if not (prior_dir / req).is_file():
            print(f"FAIL_CLOSED: required prior evidence missing: {prior_dir / req}", file=sys.stderr)
            sys.exit(1)

    if not thresholds_path.is_file():
        print(f"FAIL_CLOSED: recovery_thresholds.json missing: {thresholds_path}", file=sys.stderr)
        sys.exit(1)

    gm = json.loads((prior_dir / "governance_metrics.json").read_text(encoding="utf-8"))
    adv = json.loads((prior_dir / "advisory_signals.json").read_text(encoding="utf-8"))
    port = json.loads((prior_dir / "portfolio_signals.json").read_text(encoding="utf-8"))
    board = json.loads((prior_dir / "board_intelligence.json").read_text(encoding="utf-8"))
    portres = json.loads((prior_dir / "portfolio_registry_resolution.json").read_text(encoding="utf-8"))
    thresholds = json.loads(thresholds_path.read_text(encoding="utf-8"))

    # Derive metrics from actual evidence structure
    phase_velocity_days = latest_phase_velocity_days(prior_dir)
    gate_negative_rate = compute_gate_negative_rate(gm)
    portfolio_coverage_ratio = compute_portfolio_coverage_ratio(board)
    # advisory_signals.json uses "overall_advisory_severity" not "overall_severity"
    advisory_severity = adv["overall_advisory_severity"]
    # board_intelligence.json uses "portfolio_state", derive board_signal_severity
    board_signal_severity = derive_board_signal_severity(board["portfolio_state"])
    coverage_disclosure = build_coverage_disclosure(board)

    # Build degradation drivers
    drivers = []

    cadence_priority = priority_from_high_metric(phase_velocity_days, thresholds["phase_velocity_days_latest"])
    drivers.append({
        "driver_id": "cadence_instability",
        "metric_name": "phase_velocity_days_latest",
        "metric_value": phase_velocity_days,
        "priority": cadence_priority,
        "threshold_source": "recovery_thresholds.phase_velocity_days_latest",
        "evidence_source": "governance_metrics.json",
        "driver_summary": "Latest phase transition cadence indicates execution instability pressure.",
    })

    evidence_priority = priority_from_low_metric(gm["evidence_density"], thresholds["evidence_density"])
    drivers.append({
        "driver_id": "evidence_density_gap",
        "metric_name": "evidence_density",
        "metric_value": gm["evidence_density"],
        "priority": evidence_priority,
        "threshold_source": "recovery_thresholds.evidence_density",
        "evidence_source": "governance_metrics.json",
        "driver_summary": "Evidence density suggests insufficient proof concentration per phase.",
    })

    gate_priority = priority_from_high_metric(gate_negative_rate, thresholds["gate_negative_rate"])
    drivers.append({
        "driver_id": "negative_gate_pressure",
        "metric_name": "gate_negative_rate",
        "metric_value": gate_negative_rate,
        "priority": gate_priority,
        "threshold_source": "recovery_thresholds.gate_negative_rate",
        "evidence_source": "governance_metrics.json",
        "driver_summary": "Negative gate markers indicate accumulated control friction or unresolved governance issues.",
    })

    coverage_priority = priority_from_low_metric(portfolio_coverage_ratio, thresholds["portfolio_coverage_ratio"])
    drivers.append({
        "driver_id": "portfolio_coverage_gap",
        "metric_name": "portfolio_coverage_ratio",
        "metric_value": portfolio_coverage_ratio,
        "priority": coverage_priority,
        "threshold_source": "recovery_thresholds.portfolio_coverage_ratio",
        "evidence_source": "board_intelligence.json",
        "driver_summary": "Portfolio coverage is insufficient for strong cross-project decision confidence.",
    })

    severity_priority = thresholds["advisory_overall_severity"].get(advisory_severity, "P3_MONITOR")
    drivers.append({
        "driver_id": "critical_advisory_state",
        "metric_name": "overall_advisory_severity",
        "metric_value": advisory_severity,
        "priority": severity_priority,
        "threshold_source": "recovery_thresholds.advisory_overall_severity",
        "evidence_source": "advisory_signals.json",
        "driver_summary": "Advisory layer indicates elevated decision risk requiring structured recovery governance.",
    })

    priority_rank = {"P0_IMMEDIATE": 0, "P1_URGENT": 1, "P2_CONTROLLED": 2, "P3_MONITOR": 3}
    drivers.sort(key=lambda x: (priority_rank[x["priority"]], x["driver_id"]))

    remediation_map = {
        "cadence_instability": "Establish immediate cadence review, phase transition blocker register, and evidence-backed delay classification.",
        "evidence_density_gap": "Increase phase evidence completeness before readiness claims and enforce stronger evidence attachment discipline.",
        "negative_gate_pressure": "Review blocked, failed, and missing markers and create an explicit governance issue burn-down list.",
        "portfolio_coverage_gap": "Restore portfolio visibility by validating registered repositories and disclosing unavailable evidence sources.",
        "critical_advisory_state": "Maintain advisory-only posture and require executive review before any response action.",
    }

    remediation_items = []
    for d in drivers:
        remediation_items.append({
            "driver_id": d["driver_id"],
            "priority": d["priority"],
            "metric_name": d["metric_name"],
            "metric_value": d["metric_value"],
            "evidence_source": d["evidence_source"],
            "remediation_action": remediation_map[d["driver_id"]],
            "approval_posture": "HUMAN_APPROVAL_REQUIRED",
        })

    recovery_plan = {
        "computed_at": ts,
        "governance_posture_target": "STABILIZING",
        "current_advisory_severity": advisory_severity,
        "current_board_signal_severity": board_signal_severity,
        "recovery_priorities": remediation_items,
        "recovery_rule": "No posture restoration may be claimed until future persisted evidence confirms improvement.",
    }

    # Portfolio stabilization — unavailable projects from registry resolution
    unavailable_projects = [
        p for p in portres["projects"]
        if p.get("status") != "AVAILABLE"
    ]

    stabilization_plan = {
        "computed_at": ts,
        "portfolio_state_target": "COVERAGE_STABILIZING",
        "registered_projects": board["registered_projects"],
        "available_projects": board["available_projects"],
        "portfolio_coverage_ratio": portfolio_coverage_ratio,
        "unavailable_projects": unavailable_projects,
        "stabilization_actions": [
            "Validate registered project roots and evidence roots.",
            "Disclose unavailable projects in all portfolio reporting.",
            "Avoid overconfident board conclusions when evidence coverage is degraded.",
        ],
    }

    executive_summary = {
        "computed_at": ts,
        "current_state": {
            "governance_posture": gm["overall_governance_posture"],
            "advisory_severity": advisory_severity,
            "portfolio_state": board["portfolio_state"],
        },
        "top_recovery_priority": remediation_items[0]["priority"] if remediation_items else "P3_MONITOR",
        "driver_count": len(drivers),
        "coverage_disclosure": coverage_disclosure,
        "decision_posture": "ADVISORY_ONLY",
    }

    out_dir.mkdir(parents=True, exist_ok=True)

    (out_dir / "degradation_drivers.json").write_text(
        json.dumps({"computed_at": ts, "drivers": drivers}, indent=2), encoding="utf-8"
    )
    print("  wrote degradation_drivers.json")

    (out_dir / "critical_signal_remediation.json").write_text(
        json.dumps({"computed_at": ts, "remediation_items": remediation_items}, indent=2), encoding="utf-8"
    )
    print("  wrote critical_signal_remediation.json")

    (out_dir / "governance_recovery_plan.json").write_text(
        json.dumps(recovery_plan, indent=2), encoding="utf-8"
    )
    print("  wrote governance_recovery_plan.json")

    (out_dir / "portfolio_stabilization_plan.json").write_text(
        json.dumps(stabilization_plan, indent=2), encoding="utf-8"
    )
    print("  wrote portfolio_stabilization_plan.json")

    (out_dir / "executive_recovery_summary.json").write_text(
        json.dumps(executive_summary, indent=2), encoding="utf-8"
    )
    print("  wrote executive_recovery_summary.json")

    summary_lines = [
        "# PHASE 74 SUMMARY",
        "",
        f"Computed At: {ts}",
        f"SOT Commit: 5caadaa5ff120d6c0db45d34b52cd94e4efec95c",
        "",
        "## Degradation Drivers",
        f"- Driver count: {len(drivers)}",
        f"- Top priority: {drivers[0]['priority'] if drivers else 'N/A'}",
    ]
    for d in drivers:
        summary_lines.append(f"  - [{d['priority']}] {d['driver_id']}: {d['metric_name']}={d['metric_value']}")
    summary_lines += [
        "",
        "## Recovery State",
        f"- Advisory severity: {advisory_severity}",
        f"- Board signal severity: {board_signal_severity}",
        f"- Portfolio coverage ratio: {portfolio_coverage_ratio}",
        f"- Top recovery priority: {executive_summary['top_recovery_priority']}",
        "- Recovery posture: HUMAN_APPROVAL_REQUIRED",
        "",
        "STATUS=PASSED",
    ]

    (out_dir / "PHASE74_SUMMARY.md").write_text("\n".join(summary_lines) + "\n", encoding="utf-8")
    print("  wrote PHASE74_SUMMARY.md")

    print(
        f"Phase 74 complete. Drivers={len(drivers)}, "
        f"TopPriority={drivers[0]['priority'] if drivers else 'N/A'}, "
        f"AdvisorySeverity={advisory_severity}"
    )


if __name__ == "__main__":
    main()
