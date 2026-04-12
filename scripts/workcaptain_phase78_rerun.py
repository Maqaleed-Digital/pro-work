#!/usr/bin/env python3
"""
Phase 78 Rerun — Certification Upgrade Reassessment
Verifies Phase 84 resolved blocker evidence, then applies full-certification thresholds
to accepted metric values. No uplift without evidence support.
"""

import json
import sys
from pathlib import Path


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data):
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"  wrote {path.name}")


def main():
    if len(sys.argv) != 4:
        print(
            "usage: workcaptain_phase78_rerun.py "
            "<prior_evidence_dir> <output_evidence_dir> <thresholds_json>",
            file=sys.stderr,
        )
        sys.exit(1)

    prior_dir = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    thresholds = load_json(Path(sys.argv[3]).resolve())

    # Validate required prior evidence
    for req in ["blocker_real_submission_results.json", "blocker_real_closure_status.json",
                "blocker_real_closure_summary.json", "certification_rerun_readiness.json"]:
        if not (prior_dir / req).is_file():
            print(f"FAIL_CLOSED: required prior evidence missing: {prior_dir / req}", file=sys.stderr)
            sys.exit(1)

    summary = load_json(prior_dir / "blocker_real_closure_summary.json")
    readiness = load_json(prior_dir / "certification_rerun_readiness.json")

    req = thresholds["rerun_requirements"]
    defaults = thresholds["decision_defaults"]
    full_cert = thresholds["full_certification"]
    cond_cert = thresholds["conditional_certification"]

    total_blockers = int(summary["total_blockers"])
    resolved_blockers = int(summary["resolved_blockers"])
    open_blockers = int(summary["open_blockers"])
    rerun_ready = bool(readiness["phase78_rerun_ready"])

    # Verify rerun preconditions
    fail_reasons = []
    if total_blockers != req["total_blockers_must_equal"]:
        fail_reasons.append(f"total_blockers expected {req['total_blockers_must_equal']} but found {total_blockers}")
    if resolved_blockers != req["resolved_blockers_must_equal"]:
        fail_reasons.append(f"resolved_blockers expected {req['resolved_blockers_must_equal']} but found {resolved_blockers}")
    if open_blockers != req["open_blockers_must_equal"]:
        fail_reasons.append(f"open_blockers expected {req['open_blockers_must_equal']} but found {open_blockers}")
    if rerun_ready != req["phase78_rerun_ready_must_equal"]:
        fail_reasons.append(f"phase78_rerun_ready expected {req['phase78_rerun_ready_must_equal']} but found {rerun_ready}")

    if fail_reasons:
        print("FAIL_CLOSED: rerun requirements not satisfied", file=sys.stderr)
        for reason in fail_reasons:
            print(f"  {reason}", file=sys.stderr)
        sys.exit(1)

    print(f"Rerun preconditions verified: {resolved_blockers}/{total_blockers} blockers resolved, rerun_ready={rerun_ready}")

    # Apply full-certification thresholds to accepted metric values.
    # Phase 84 acceptance records accepted these conditions at CONDITIONALLY_CERTIFIED posture —
    # they do not constitute metric improvement. No uplift without evidence support.
    confidence = defaults["confidence"]
    confidence_band = defaults["confidence_band"]
    coverage_ratio = defaults["coverage_ratio"]

    # P0 count: Phase 84 accepted the unresolved_p0_blockers condition via governance acceptance,
    # but the actual P0 driver count from Phase 74/75 remains 2.
    p0_count = 2

    full_cert_gaps = []
    if confidence < full_cert["min_confidence"]:
        full_cert_gaps.append(f"confidence {confidence} < {full_cert['min_confidence']} (full cert minimum)")
    if coverage_ratio < full_cert["min_coverage_ratio"]:
        full_cert_gaps.append(f"coverage_ratio {coverage_ratio} < {full_cert['min_coverage_ratio']} (full cert minimum)")
    if p0_count > full_cert["max_p0_blockers"]:
        full_cert_gaps.append(f"p0_count {p0_count} > {full_cert['max_p0_blockers']} (full cert maximum)")

    # Apply thresholds
    if len(full_cert_gaps) == 0:
        assessed_status = "CERTIFIED"
        upgrade_result = "UPGRADED"
    elif (confidence >= cond_cert["min_confidence"]
          and coverage_ratio >= cond_cert["min_coverage_ratio"]
          and p0_count <= cond_cert["max_p0_blockers"]):
        assessed_status = "CONDITIONALLY_CERTIFIED"
        upgrade_result = "NOT_UPGRADED"
    else:
        assessed_status = "NOT_RESTORED"
        upgrade_result = "NOT_UPGRADED"

    reassessment_basis = [
        "All five certification upgrade blockers resolved in Phase 84 via governance acceptance records.",
        "Certification rerun readiness verified true.",
        "Accepted metric values from Phase 84 decision_defaults applied to full-certification thresholds.",
    ]
    if full_cert_gaps:
        reassessment_basis.append("Full-certification thresholds not met — remaining gaps:")
        for gap in full_cert_gaps:
            reassessment_basis.append(f"  - {gap}")
        reassessment_basis.append(
            "Phase 84 acceptance records explicitly accepted these conditions at CONDITIONALLY_CERTIFIED posture."
        )

    reassessment_inputs = {
        "source_evidence_dir": str(prior_dir),
        "total_blockers": total_blockers,
        "resolved_blockers": resolved_blockers,
        "open_blockers": open_blockers,
        "rerun_ready": rerun_ready,
        "confidence": confidence,
        "confidence_band": confidence_band,
        "coverage_ratio": coverage_ratio,
        "p0_count": p0_count,
        "full_cert_gaps": full_cert_gaps,
    }

    assessment = {
        "assessed_status": assessed_status,
        "upgrade_result": upgrade_result,
        "confidence": confidence,
        "confidence_band": confidence_band,
        "coverage_ratio": coverage_ratio,
        "p0_count": p0_count,
        "full_cert_gaps": full_cert_gaps,
        "reassessment_basis": reassessment_basis,
        "human_authority": "FINAL",
    }

    final_decision = {
        "final_status": assessed_status,
        "upgrade_result": upgrade_result,
        "confidence": confidence,
        "confidence_band": confidence_band,
        "coverage_ratio": coverage_ratio,
        "full_cert_gaps": full_cert_gaps,
        "decision_basis": (
            "Phase 84 resolved evidence and accepted governance closure records. "
            "Full-certification thresholds applied to accepted metric values."
        ),
    }

    board_summary = {
        "headline": assessed_status,
        "upgrade_result": upgrade_result,
        "confidence": confidence,
        "confidence_band": confidence_band,
        "coverage_ratio": coverage_ratio,
        "full_cert_gaps_count": len(full_cert_gaps),
        "board_message": (
            "All Phase 84 blocker tracking obligations are resolved via governance acceptance records. "
            f"Platform remains at {assessed_status}. "
            "Full CERTIFIED status requires: confidence >= 0.75, coverage_ratio >= 0.80, p0_count == 0."
        ),
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    write_json(out_dir / "phase78_rerun_reassessment_inputs.json", reassessment_inputs)
    write_json(out_dir / "phase78_rerun_assessment.json", assessment)
    write_json(out_dir / "phase78_rerun_final_decision.json", final_decision)
    write_json(out_dir / "phase78_rerun_board_summary.json", board_summary)

    summary_lines = [
        "# PHASE 78 RERUN SUMMARY",
        "",
        f"- Final status: {assessed_status}",
        f"- Upgrade result: {upgrade_result}",
        f"- Confidence: {confidence} ({confidence_band})",
        f"- Coverage ratio: {coverage_ratio}",
        f"- P0 count: {p0_count}",
        f"- Full-cert gaps: {len(full_cert_gaps)}",
    ]
    if full_cert_gaps:
        summary_lines.append("- Remaining gaps for CERTIFIED:")
        for gap in full_cert_gaps:
            summary_lines.append(f"  - {gap}")
    summary_lines += ["", "STATUS=PASSED"]

    (out_dir / "PHASE78_RERUN_SUMMARY.md").write_text("\n".join(summary_lines) + "\n", encoding="utf-8")
    print("  wrote PHASE78_RERUN_SUMMARY.md")

    print(
        f"Phase 78 rerun complete. Status={assessed_status}, UpgradeResult={upgrade_result}, "
        f"Confidence={confidence}, Coverage={coverage_ratio}, FullCertGaps={len(full_cert_gaps)}"
    )


if __name__ == "__main__":
    main()
