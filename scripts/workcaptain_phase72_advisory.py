#!/usr/bin/env python3
"""
Phase 72 — Advisory Intelligence
Reads Phase 71 governance metrics, applies advisory thresholds, produces advisory signals and recommendations.
No HTTP calls. Pure analytics.
"""

import json
import os
import sys
from datetime import datetime, timezone


def load_json(path):
    with open(path, "r") as f:
        return json.load(f)


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  wrote {os.path.basename(path)}")


def evaluate_metric(metric_name, value, thresholds, recommendations):
    """Returns (severity, message) for a given metric value against threshold rules."""
    t = thresholds.get(metric_name)
    if t is None:
        return None

    recs = recommendations or {}

    # Handle ratio/count metrics with min thresholds (higher is better)
    if "info_min" in t:
        info_min = t["info_min"]
        watch_min = t.get("watch_min", info_min)
        action_min = t.get("action_min", watch_min)
        critical_below = t.get("critical_below", action_min)

        if value >= info_min:
            return ("INFO", recs.get(f"{metric_name}_info", f"{metric_name} is within normal range ({value})."))
        elif value >= watch_min:
            return ("WATCH", recs.get(f"{metric_name}_watch", f"{metric_name} is approaching threshold ({value})."))
        elif value >= action_min:
            return ("ACTION", recs.get(f"{metric_name}_action", f"{metric_name} has crossed the action threshold ({value})."))
        else:
            return ("CRITICAL", recs.get(f"{metric_name}_critical", f"{metric_name} is critically low ({value})."))

    # Handle count metrics with max thresholds (lower is better)
    if "info_max" in t:
        info_max = t["info_max"]
        watch_max = t.get("watch_max", info_max)
        action_max = t.get("action_max", watch_max)
        critical_above = t.get("critical_above", action_max)

        if value <= info_max:
            return ("INFO", recs.get(f"{metric_name}_info", f"{metric_name} is within normal range ({value})."))
        elif value <= watch_max:
            return ("WATCH", recs.get(f"{metric_name}_watch", f"{metric_name} is approaching threshold ({value})."))
        elif value <= action_max:
            return ("ACTION", recs.get(f"{metric_name}_action", f"{metric_name} has crossed the action threshold ({value})."))
        else:
            return ("CRITICAL", recs.get(f"{metric_name}_critical", f"{metric_name} is critically elevated ({value})."))

    return None


SEVERITY_ORDER = {"INFO": 0, "WATCH": 1, "ACTION": 2, "CRITICAL": 3}


def highest_severity(signals):
    if not signals:
        return "INFO"
    return max((s["severity"] for s in signals), key=lambda s: SEVERITY_ORDER.get(s, 0))


def main():
    if len(sys.argv) < 4:
        print("Usage: workcaptain_phase72_advisory.py <governance_metrics_path> <thresholds_path> <output_dir>")
        sys.exit(1)

    metrics_path = sys.argv[1]
    thresholds_path = sys.argv[2]
    output_dir = sys.argv[3]
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print(f"Phase 72 Advisory Intelligence — metrics: {metrics_path}")

    if not os.path.isfile(metrics_path):
        print(f"ERROR: governance_metrics.json not found: {metrics_path}")
        sys.exit(1)
    if not os.path.isfile(thresholds_path):
        print(f"ERROR: advisory_thresholds.json not found: {thresholds_path}")
        sys.exit(1)

    metrics = load_json(metrics_path)
    threshold_config = load_json(thresholds_path)
    thresholds = threshold_config.get("thresholds", {})
    recommendations = threshold_config.get("recommendations", {})

    evaluated_metrics = [
        ("governance_health_ratio", metrics.get("governance_health_ratio", 0)),
        ("evidence_density", metrics.get("evidence_density", 0)),
        ("negative_signal_count", metrics.get("negative_signal_count", 0)),
        ("closure_signal_count", metrics.get("closure_signal_count", 0)),
        ("phases_with_evidence", metrics.get("phases_with_evidence", 0)),
    ]

    signals = []
    advisory_recommendations = []

    for metric_name, value in evaluated_metrics:
        result = evaluate_metric(metric_name, value, thresholds, recommendations)
        if result is None:
            continue
        severity, message = result
        signals.append({
            "metric": metric_name,
            "value": value,
            "severity": severity,
            "message": message,
            "evaluated_at": ts,
        })
        if severity in ("WATCH", "ACTION", "CRITICAL"):
            advisory_recommendations.append({
                "metric": metric_name,
                "severity": severity,
                "recommendation": message,
                "evaluated_at": ts,
            })

    overall_severity = highest_severity(signals)

    advisory_signals = {
        "computed_at": ts,
        "source_metrics": metrics_path,
        "overall_advisory_severity": overall_severity,
        "signal_count": len(signals),
        "signals": signals,
    }

    advisory_recommendations_doc = {
        "computed_at": ts,
        "overall_advisory_severity": overall_severity,
        "recommendation_count": len(advisory_recommendations),
        "recommendations": advisory_recommendations,
    }

    write_json(os.path.join(output_dir, "advisory_signals.json"), advisory_signals)
    write_json(os.path.join(output_dir, "advisory_recommendations.json"), advisory_recommendations_doc)

    summary_lines = [
        "# PHASE 72 — ADVISORY INTELLIGENCE SUMMARY",
        "",
        f"Computed At: {ts}",
        f"Source Metrics: {metrics_path}",
        f"Overall Advisory Severity: {overall_severity}",
        "",
        "## Signals",
    ]
    for s in signals:
        summary_lines.append(f"  - [{s['severity']}] {s['metric']} = {s['value']}: {s['message']}")
    if advisory_recommendations:
        summary_lines += ["", "## Recommendations"]
        for r in advisory_recommendations:
            summary_lines.append(f"  - [{r['severity']}] {r['metric']}: {r['recommendation']}")
    summary_lines += ["", "STATUS=PASSED"]

    with open(os.path.join(output_dir, "PHASE72_SUMMARY.md"), "w") as f:
        f.write("\n".join(summary_lines) + "\n")
    print("  wrote PHASE72_SUMMARY.md")

    print(f"Phase 72 complete. OverallSeverity={overall_severity}, Signals={len(signals)}, Recommendations={len(advisory_recommendations)}")


if __name__ == "__main__":
    main()
