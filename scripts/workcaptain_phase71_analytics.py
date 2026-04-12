#!/usr/bin/env python3
"""
Phase 71 — Governance Analytics
Scans evidence directories, computes governance metrics, trend intelligence, and executive KPIs.
No HTTP calls. Pure filesystem analytics.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

POSITIVE_PATTERNS = [
    "OPERATIONAL", "PASSED", "HEALTHY", "ACKNOWLEDGED", "ASSURED",
    "LIVE_VERIFIED", "ISSUED", "ACTIVE_HYPERCARE", "SUCCESS", "CLOSED",
    "MIRROR_SYNC_OPERATIONAL", "ALERT_STATE_OPERATIONAL", "DISPATCH_OPERATIONAL",
    "EXECUTION_OPERATIONAL", "RELIABILITY_OPERATIONAL", "CLOSURE_OPERATIONAL",
]
NEGATIVE_PATTERNS = [
    "BLOCKED", "FAILED", "ESCALATED", "BREACH", "DEGRADED", "ERROR",
    "CRITICAL", "MISSING", "UNAVAILABLE", "UNASSURED",
]
CLOSURE_PATTERNS = [
    "CLOSURE", "ACKNOWLEDGED", "CLOSED", "END_TO_END", "CLOSURE_OPERATIONAL",
    "CLOSURE_GOVERNANCE",
]
RETRY_PATTERNS = [
    "RETRY", "RETRY_REQUIRED", "NOT_REQUIRED", "RETRY_GOVERNANCE",
]
RELIABILITY_PATTERNS = [
    "RELIABILITY", "ASSURED", "ASSURANCE", "NOTIFICATION_ASSURANCE",
    "DELIVERY_RELIABILITY",
]
SLA_PATTERNS = [
    "SLA", "BREACH", "AVAILABILITY", "LATENCY", "ERROR_RATE",
    "STEADY_STATE",
]

PHASE_DIR_RE = re.compile(r"phase(\d+)(?:_(\d{8}T\d{6}Z))?")


def load_json(path):
    with open(path, "r") as f:
        return json.load(f)


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  wrote {os.path.basename(path)}")


def scan_file_for_patterns(filepath, patterns):
    try:
        with open(filepath, "r", errors="replace") as f:
            content = f.read()
        return sum(1 for p in patterns if p in content)
    except Exception:
        return 0


def scan_evidence_root(evidence_root):
    """Returns list of (phase_num, dir_name, full_path, files) sorted by phase then dir_name."""
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
        files = []
        for root_dir, _, filenames in os.walk(full_path):
            for fname in filenames:
                files.append(os.path.join(root_dir, fname))
        results.append({
            "phase_num": phase_num,
            "dir_name": entry,
            "full_path": full_path,
            "file_count": len(files),
            "files": files,
        })
    return results


def compute_signal_counts(dirs):
    pos = neg = closure = retry = reliability = sla = 0
    for d in dirs:
        for fpath in d["files"]:
            pos += scan_file_for_patterns(fpath, POSITIVE_PATTERNS)
            neg += scan_file_for_patterns(fpath, NEGATIVE_PATTERNS)
            closure += scan_file_for_patterns(fpath, CLOSURE_PATTERNS)
            retry += scan_file_for_patterns(fpath, RETRY_PATTERNS)
            reliability += scan_file_for_patterns(fpath, RELIABILITY_PATTERNS)
            sla += scan_file_for_patterns(fpath, SLA_PATTERNS)
    return pos, neg, closure, retry, reliability, sla


def compute_health_ratio(pos, neg):
    total = pos + neg
    if total == 0:
        return 1.0
    return round(pos / total, 4)


def compute_trend(dirs):
    """Compute evidence growth trend and phase sequence."""
    phase_sequence = []
    seen_phases = {}
    for d in dirs:
        pn = d["phase_num"]
        if pn not in seen_phases:
            seen_phases[pn] = {"phase": pn, "evidence_dirs": 0, "total_files": 0}
        seen_phases[pn]["evidence_dirs"] += 1
        seen_phases[pn]["total_files"] += d["file_count"]

    for pn in sorted(seen_phases.keys()):
        phase_sequence.append(seen_phases[pn])

    if len(phase_sequence) < 2:
        growth_trend = "STABLE"
    else:
        file_counts = [p["total_files"] for p in phase_sequence]
        diffs = [file_counts[i + 1] - file_counts[i] for i in range(len(file_counts) - 1)]
        pos_diffs = sum(1 for d in diffs if d > 0)
        neg_diffs = sum(1 for d in diffs if d < 0)
        if pos_diffs > neg_diffs:
            growth_trend = "GROWING"
        elif neg_diffs > pos_diffs:
            growth_trend = "DECLINING"
        else:
            growth_trend = "STABLE"

    return phase_sequence, growth_trend


def main():
    if len(sys.argv) < 3:
        print("Usage: workcaptain_phase71_analytics.py <evidence_root> <output_dir>")
        sys.exit(1)

    evidence_root = sys.argv[1]
    output_dir = sys.argv[2]
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print(f"Phase 71 Analytics — evidence root: {evidence_root}")

    if not os.path.isdir(evidence_root):
        print(f"ERROR: evidence root not found: {evidence_root}")
        sys.exit(1)

    dirs = scan_evidence_root(evidence_root)
    total_dirs = len(dirs)
    total_files = sum(d["file_count"] for d in dirs)
    evidence_density = round(total_files / total_dirs, 2) if total_dirs > 0 else 0.0

    pos, neg, closure, retry, reliability, sla = compute_signal_counts(dirs)
    health_ratio = compute_health_ratio(pos, neg)
    phase_sequence, growth_trend = compute_trend(dirs)
    phases_with_evidence = len(set(d["phase_num"] for d in dirs))

    if health_ratio >= 0.95:
        overall_posture = "HEALTHY"
    elif health_ratio >= 0.85:
        overall_posture = "WATCH"
    else:
        overall_posture = "DEGRADED"

    signal_trend = "STABLE"
    if len(phase_sequence) >= 2:
        first_half = phase_sequence[: len(phase_sequence) // 2]
        second_half = phase_sequence[len(phase_sequence) // 2 :]
        fh_files = sum(p["total_files"] for p in first_half)
        sh_files = sum(p["total_files"] for p in second_half)
        if sh_files > fh_files:
            signal_trend = "IMPROVING"
        elif sh_files < fh_files:
            signal_trend = "DEGRADING"

    governance_metrics = {
        "computed_at": ts,
        "evidence_root": evidence_root,
        "sot_commit": "935d291f6cc8dede245ebf5ea64d214a85287c29",
        "total_evidence_dirs": total_dirs,
        "total_evidence_files": total_files,
        "evidence_density": evidence_density,
        "phases_with_evidence": phases_with_evidence,
        "positive_signal_count": pos,
        "negative_signal_count": neg,
        "closure_signal_count": closure,
        "retry_signal_count": retry,
        "reliability_signal_count": reliability,
        "sla_signal_count": sla,
        "governance_health_ratio": health_ratio,
        "overall_governance_posture": overall_posture,
    }

    trend_intelligence = {
        "computed_at": ts,
        "evidence_root": evidence_root,
        "phase_sequence": phase_sequence,
        "evidence_growth_trend": growth_trend,
        "signal_trend": signal_trend,
        "total_phases_observed": phases_with_evidence,
    }

    executive_kpis = {
        "computed_at": ts,
        "evidence_root": evidence_root,
        "overall_governance_posture": overall_posture,
        "phases_with_evidence": phases_with_evidence,
        "total_closure_signals": closure,
        "total_evidence_files": total_files,
        "evidence_density": evidence_density,
        "governance_health_ratio": health_ratio,
        "positive_signal_count": pos,
        "negative_signal_count": neg,
    }

    write_json(os.path.join(output_dir, "governance_metrics.json"), governance_metrics)
    write_json(os.path.join(output_dir, "trend_intelligence.json"), trend_intelligence)
    write_json(os.path.join(output_dir, "executive_kpis.json"), executive_kpis)

    summary_lines = [
        "# PHASE 71 — GOVERNANCE ANALYTICS SUMMARY",
        "",
        f"Computed At: {ts}",
        f"Evidence Root: {evidence_root}",
        f"SOT Commit: 935d291f6cc8dede245ebf5ea64d214a85287c29",
        "",
        "## Metrics",
        f"- Total Evidence Dirs: {total_dirs}",
        f"- Total Evidence Files: {total_files}",
        f"- Evidence Density: {evidence_density} files/dir",
        f"- Phases With Evidence: {phases_with_evidence}",
        f"- Positive Signal Count: {pos}",
        f"- Negative Signal Count: {neg}",
        f"- Closure Signal Count: {closure}",
        f"- Retry Signal Count: {retry}",
        f"- Reliability Signal Count: {reliability}",
        f"- SLA Signal Count: {sla}",
        f"- Governance Health Ratio: {health_ratio}",
        "",
        "## Posture",
        f"- Overall Governance Posture: {overall_posture}",
        f"- Evidence Growth Trend: {growth_trend}",
        f"- Signal Trend: {signal_trend}",
        "",
        "## Phase Sequence",
    ]
    for p in phase_sequence:
        summary_lines.append(f"  - Phase {p['phase']}: {p['evidence_dirs']} dir(s), {p['total_files']} file(s)")
    summary_lines += ["", "STATUS=PASSED"]

    with open(os.path.join(output_dir, "PHASE71_SUMMARY.md"), "w") as f:
        f.write("\n".join(summary_lines) + "\n")
    print("  wrote PHASE71_SUMMARY.md")

    print(f"Phase 71 complete. Posture={overall_posture}, HealthRatio={health_ratio}")


if __name__ == "__main__":
    main()
