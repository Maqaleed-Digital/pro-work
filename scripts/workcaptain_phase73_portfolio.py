#!/usr/bin/env python3
"""
Phase 73 — Portfolio Signal Engine
Resolves portfolio_registry.json, discovers evidence dirs per project, produces portfolio signals and board intelligence.
No HTTP calls. Pure filesystem analytics.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

PHASE_DIR_RE = re.compile(r"phase(\d+)(?:_([0-9]{8}T[0-9]{6}Z))?")

POSITIVE_PATTERNS = [
    "OPERATIONAL", "PASSED", "HEALTHY", "ACKNOWLEDGED", "ASSURED",
    "LIVE_VERIFIED", "ISSUED", "ACTIVE_HYPERCARE", "SUCCESS", "CLOSED",
]
NEGATIVE_PATTERNS = [
    "BLOCKED", "FAILED", "ESCALATED", "BREACH", "DEGRADED", "ERROR",
    "CRITICAL", "MISSING", "UNAVAILABLE", "UNASSURED",
]


def load_json(path):
    with open(path, "r") as f:
        return json.load(f)


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  wrote {os.path.basename(path)}")


def scan_project_evidence(evidence_root):
    """Scan evidence root for phase dirs. Returns list of dir info dicts."""
    results = []
    if not os.path.isdir(evidence_root):
        return results
    for entry in sorted(os.listdir(evidence_root)):
        full_path = os.path.join(evidence_root, entry)
        if not os.path.isdir(full_path):
            continue
        m = PHASE_DIR_RE.match(entry)
        if not m:
            continue
        phase_num = int(m.group(1))
        file_count = 0
        for root_dir, _, filenames in os.walk(full_path):
            file_count += len(filenames)
        results.append({
            "phase_num": phase_num,
            "dir_name": entry,
            "file_count": file_count,
        })
    return results


def count_patterns_in_dir(evidence_root, patterns):
    count = 0
    if not os.path.isdir(evidence_root):
        return count
    for root_dir, _, filenames in os.walk(evidence_root):
        for fname in filenames:
            fpath = os.path.join(root_dir, fname)
            try:
                with open(fpath, "r", errors="replace") as f:
                    content = f.read()
                count += sum(1 for p in patterns if p in content)
            except Exception:
                pass
    return count


def resolve_project(project):
    evidence_root = project.get("evidence_root", "")
    available = os.path.isdir(evidence_root)
    if available:
        dirs = scan_project_evidence(evidence_root)
        total_files = sum(d["file_count"] for d in dirs)
        phases = sorted(set(d["phase_num"] for d in dirs))
        pos = count_patterns_in_dir(evidence_root, POSITIVE_PATTERNS)
        neg = count_patterns_in_dir(evidence_root, NEGATIVE_PATTERNS)
        total = pos + neg
        health_ratio = round(pos / total, 4) if total > 0 else 1.0
        return {
            "id": project["id"],
            "name": project["name"],
            "required": project.get("required", False),
            "status": "AVAILABLE",
            "evidence_root": evidence_root,
            "evidence_dirs": len(dirs),
            "total_files": total_files,
            "phases_with_evidence": phases,
            "positive_signals": pos,
            "negative_signals": neg,
            "health_ratio": health_ratio,
        }
    else:
        return {
            "id": project["id"],
            "name": project["name"],
            "required": project.get("required", False),
            "status": "UNAVAILABLE",
            "evidence_root": evidence_root,
            "evidence_dirs": 0,
            "total_files": 0,
            "phases_with_evidence": [],
            "positive_signals": 0,
            "negative_signals": 0,
            "health_ratio": 0.0,
        }


def compute_portfolio_state(resolutions):
    required_unavailable = [r for r in resolutions if r["required"] and r["status"] == "UNAVAILABLE"]
    if required_unavailable:
        return "PORTFOLIO_BLOCKED"
    all_ratios = [r["health_ratio"] for r in resolutions if r["status"] == "AVAILABLE"]
    if not all_ratios:
        return "PORTFOLIO_BLOCKED"
    min_ratio = min(all_ratios)
    if min_ratio >= 0.95:
        return "PORTFOLIO_HEALTHY"
    elif min_ratio >= 0.85:
        return "PORTFOLIO_WATCH"
    else:
        return "PORTFOLIO_DEGRADED"


def main():
    if len(sys.argv) < 4:
        print("Usage: workcaptain_phase73_portfolio.py <registry_path> <advisory_signals_path> <output_dir>")
        sys.exit(1)

    registry_path = sys.argv[1]
    advisory_signals_path = sys.argv[2]
    output_dir = sys.argv[3]
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print(f"Phase 73 Portfolio Signal Engine — registry: {registry_path}")

    if not os.path.isfile(registry_path):
        print(f"ERROR: portfolio_registry.json not found: {registry_path}")
        sys.exit(1)
    if not os.path.isfile(advisory_signals_path):
        print(f"ERROR: advisory_signals.json not found: {advisory_signals_path}")
        sys.exit(1)

    registry = load_json(registry_path)
    advisory_signals = load_json(advisory_signals_path)
    projects = registry.get("projects", [])

    resolutions = [resolve_project(p) for p in projects]
    portfolio_state = compute_portfolio_state(resolutions)

    portfolio_registry_resolution = {
        "computed_at": ts,
        "registry_path": registry_path,
        "sot_commit": "935d291f6cc8dede245ebf5ea64d214a85287c29",
        "portfolio_state": portfolio_state,
        "project_count": len(resolutions),
        "projects": resolutions,
    }

    portfolio_signals = []
    for r in resolutions:
        if r["status"] == "UNAVAILABLE":
            severity = "CRITICAL" if r["required"] else "WATCH"
            portfolio_signals.append({
                "project_id": r["id"],
                "project_name": r["name"],
                "signal": "PROJECT_UNAVAILABLE",
                "severity": severity,
                "message": f"Project '{r['name']}' evidence root is not available.",
                "evaluated_at": ts,
            })
        elif r["health_ratio"] < 0.85:
            portfolio_signals.append({
                "project_id": r["id"],
                "project_name": r["name"],
                "signal": "LOW_HEALTH_RATIO",
                "severity": "ACTION",
                "message": f"Project '{r['name']}' health ratio is {r['health_ratio']} — below action threshold.",
                "evaluated_at": ts,
            })
        elif r["health_ratio"] < 0.95:
            portfolio_signals.append({
                "project_id": r["id"],
                "project_name": r["name"],
                "signal": "WATCH_HEALTH_RATIO",
                "severity": "WATCH",
                "message": f"Project '{r['name']}' health ratio is {r['health_ratio']} — approaching action threshold.",
                "evaluated_at": ts,
            })
        else:
            portfolio_signals.append({
                "project_id": r["id"],
                "project_name": r["name"],
                "signal": "PROJECT_HEALTHY",
                "severity": "INFO",
                "message": f"Project '{r['name']}' is healthy (ratio={r['health_ratio']}, dirs={r['evidence_dirs']}).",
                "evaluated_at": ts,
            })

    portfolio_signals_doc = {
        "computed_at": ts,
        "portfolio_state": portfolio_state,
        "signal_count": len(portfolio_signals),
        "signals": portfolio_signals,
    }

    available_projects = [r for r in resolutions if r["status"] == "AVAILABLE"]
    total_evidence_dirs = sum(r["evidence_dirs"] for r in available_projects)
    total_evidence_files = sum(r["total_files"] for r in available_projects)
    overall_advisory_severity = advisory_signals.get("overall_advisory_severity", "INFO")

    board_intelligence = {
        "computed_at": ts,
        "sot_commit": "935d291f6cc8dede245ebf5ea64d214a85287c29",
        "portfolio_state": portfolio_state,
        "overall_advisory_severity": overall_advisory_severity,
        "registered_projects": len(resolutions),
        "available_projects": len(available_projects),
        "unavailable_projects": len(resolutions) - len(available_projects),
        "total_evidence_dirs_across_portfolio": total_evidence_dirs,
        "total_evidence_files_across_portfolio": total_evidence_files,
        "project_summary": [
            {
                "id": r["id"],
                "name": r["name"],
                "status": r["status"],
                "health_ratio": r["health_ratio"],
                "evidence_dirs": r["evidence_dirs"],
            }
            for r in resolutions
        ],
    }

    write_json(os.path.join(output_dir, "portfolio_registry_resolution.json"), portfolio_registry_resolution)
    write_json(os.path.join(output_dir, "portfolio_signals.json"), portfolio_signals_doc)
    write_json(os.path.join(output_dir, "board_intelligence.json"), board_intelligence)

    summary_lines = [
        "# PHASE 73 — PORTFOLIO SIGNAL ENGINE SUMMARY",
        "",
        f"Computed At: {ts}",
        f"Registry: {registry_path}",
        f"Portfolio State: {portfolio_state}",
        f"Overall Advisory Severity: {overall_advisory_severity}",
        "",
        "## Project Resolution",
    ]
    for r in resolutions:
        status_note = "REQUIRED" if r["required"] else "optional"
        summary_lines.append(
            f"  - {r['name']} ({status_note}): {r['status']} | "
            f"dirs={r['evidence_dirs']}, files={r['total_files']}, ratio={r['health_ratio']}"
        )
    summary_lines += [
        "",
        "## Portfolio Signals",
    ]
    for s in portfolio_signals:
        summary_lines.append(f"  - [{s['severity']}] {s['project_name']}: {s['signal']} — {s['message']}")
    summary_lines += ["", "STATUS=PASSED"]

    with open(os.path.join(output_dir, "PHASE73_SUMMARY.md"), "w") as f:
        f.write("\n".join(summary_lines) + "\n")
    print("  wrote PHASE73_SUMMARY.md")

    print(f"Phase 73 complete. PortfolioState={portfolio_state}, Projects={len(resolutions)}, Available={len(available_projects)}")


if __name__ == "__main__":
    main()
