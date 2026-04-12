#!/usr/bin/env python3
"""
Phase 78 — Full Stabilization Completion + Certification Upgrade
Reads Phase 75-77 evidence, evaluates certification upgrade blockers, produces upgrade assessment and final decision.
No HTTP calls. Pure analytics.
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
            "usage: workcaptain_phase78_upgrade.py "
            "<prior_evidence_dir> <output_evidence_dir> <thresholds_json>",
            file=sys.stderr,
        )
        sys.exit(1)

    prior_dir = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    thresholds = load_json(Path(sys.argv[3]).resolve())

    # Validate required prior evidence
    required_files = [
        "recovery_execution_controls.json",
        "remediation_execution_register.json",
        "stabilization_assurance.json",
        "measured_validation.json",
        "board_recognition_packet.json",
        "final_operating_seal.json",
        "executive_board_summary.json",
    ]
    for req in required_files:
        if not (prior_dir / req).is_file():
            print(f"FAIL_CLOSED: required prior evidence missing: {prior_dir / req}", file=sys.stderr)
            sys.exit(1)

    recovery_controls = load_json(prior_dir / "recovery_execution_controls.json")
    remediation_register = load_json(prior_dir / "remediation_execution_register.json")
    stabilization_assurance = load_json(prior_dir / "stabilization_assurance.json")
    measured_validation = load_json(prior_dir / "measured_validation.json")
    board_packet = load_json(prior_dir / "board_recognition_packet.json")

    full_rules = thresholds["full_certification"]
    conditional_rules = thresholds["conditional_certification"]

    control_items = recovery_controls["controls"]
    p0_blockers = sum(1 for c in control_items if c["priority"] == "P0_IMMEDIATE")
    planned_not_executed = [
        r for r in remediation_register["register_items"]
        if r["execution_state"] != "EXECUTED_AND_VALIDATED"
    ]

    confidence = float(stabilization_assurance["assurance_confidence"])
    coverage_ratio = float(stabilization_assurance["portfolio_coverage_ratio"])
    validation_result = measured_validation["validation_result"]
    prior_status = board_packet["certification_status"]

    # Enumerate blockers to full certification
    blockers = []

    if p0_blockers > full_rules["max_p0_blockers"]:
        blockers.append({
            "gap_id": "unresolved_p0_blockers",
            "gap_type": "BLOCKING",
            "current_value": p0_blockers,
            "required_value": full_rules["max_p0_blockers"],
            "reason": "Full certification requires zero unresolved P0 blockers.",
        })

    if confidence < full_rules["min_confidence"]:
        blockers.append({
            "gap_id": "confidence_below_full_certification",
            "gap_type": "BLOCKING",
            "current_value": confidence,
            "required_value": full_rules["min_confidence"],
            "reason": "Confidence remains below full-certification minimum.",
        })

    if coverage_ratio < full_rules["min_coverage_ratio"]:
        blockers.append({
            "gap_id": "coverage_ratio_below_full_certification",
            "gap_type": "BLOCKING",
            "current_value": coverage_ratio,
            "required_value": full_rules["min_coverage_ratio"],
            "reason": "Portfolio coverage remains below full-certification minimum.",
        })

    if validation_result not in full_rules["allowed_validation_results"]:
        blockers.append({
            "gap_id": "validation_result_not_upgradeable",
            "gap_type": "BLOCKING",
            "current_value": validation_result,
            "required_value": full_rules["allowed_validation_results"],
            "reason": "Validation posture is not eligible for full certification.",
        })

    if len(planned_not_executed) > full_rules["max_blocking_gap_count"]:
        blockers.append({
            "gap_id": "planned_controls_not_validated",
            "gap_type": "BLOCKING",
            "current_value": len(planned_not_executed),
            "required_value": full_rules["max_blocking_gap_count"],
            "reason": "Planned governed controls have not yet been executed and validated.",
        })

    certification_upgrade_gaps = {
        "prior_certification_status": prior_status,
        "blocking_gap_count": len(blockers),
        "blockers": blockers,
    }

    completion_actions = []
    for blocker in blockers:
        completion_actions.append({
            "gap_id": blocker["gap_id"],
            "action_required": blocker["reason"],
            "completion_rule": "Must be resolved by future persisted evidence before upgrade to CERTIFIED.",
            "approval_posture": "HUMAN_APPROVAL_REQUIRED",
        })

    stabilization_completion_plan = {
        "completion_target": "FULL_CERTIFICATION_ELIGIBILITY",
        "required_actions": completion_actions,
        "upgrade_rule": "All blockers must be closed simultaneously for CERTIFIED status.",
    }

    # Determine upgrade outcome
    if len(blockers) == 0:
        upgrade_status = "CERTIFIED"
    elif (
        confidence >= conditional_rules["min_confidence"]
        and coverage_ratio >= conditional_rules["min_coverage_ratio"]
        and p0_blockers <= conditional_rules["max_p0_blockers"]
    ):
        upgrade_status = "CONDITIONALLY_CERTIFIED"
    else:
        upgrade_status = "NOT_RESTORED"

    upgrade_result = "UPGRADED" if upgrade_status == "CERTIFIED" and prior_status != "CERTIFIED" else "NOT_UPGRADED"

    certification_upgrade_assessment = {
        "prior_status": prior_status,
        "assessed_status": upgrade_status,
        "confidence": confidence,
        "coverage_ratio": coverage_ratio,
        "validation_result": validation_result,
        "p0_blockers": p0_blockers,
        "blocking_gap_count": len(blockers),
        "upgrade_result": upgrade_result,
    }

    final_certification_decision = {
        "final_status": upgrade_status,
        "decision_basis": "Deterministic reassessment from Phase 75-77 persisted evidence.",
        "confidence": confidence,
        "coverage_ratio": coverage_ratio,
        "blocking_gap_count": len(blockers),
        "human_authority": "FINAL",
    }

    board_upgrade_summary = {
        "headline": upgrade_status,
        "previous_status": prior_status,
        "confidence": confidence,
        "coverage_ratio": coverage_ratio,
        "blocking_gap_count": len(blockers),
        "board_message": "Certification upgrade is allowed only where all evidence-derived blockers are cleared.",
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    write_json(out_dir / "certification_upgrade_gaps.json", certification_upgrade_gaps)
    write_json(out_dir / "stabilization_completion_plan.json", stabilization_completion_plan)
    write_json(out_dir / "certification_upgrade_assessment.json", certification_upgrade_assessment)
    write_json(out_dir / "final_certification_decision.json", final_certification_decision)
    write_json(out_dir / "board_upgrade_summary.json", board_upgrade_summary)

    summary_lines = [
        "# PHASE 78 SUMMARY",
        "",
        f"- Prior status: {prior_status}",
        f"- Assessed status: {upgrade_status}",
        f"- Confidence: {confidence}",
        f"- Coverage ratio: {coverage_ratio}",
        f"- P0 blockers: {p0_blockers}",
        f"- Blocking gap count: {len(blockers)}",
        f"- Upgrade result: {upgrade_result}",
        "",
        "STATUS=PASSED",
    ]
    (out_dir / "PHASE78_SUMMARY.md").write_text("\n".join(summary_lines) + "\n", encoding="utf-8")
    print("  wrote PHASE78_SUMMARY.md")

    print(
        f"Phase 78 complete. AssessedStatus={upgrade_status}, "
        f"UpgradeResult={upgrade_result}, Blockers={len(blockers)}, "
        f"Confidence={confidence}, CoverageRatio={coverage_ratio}"
    )


if __name__ == "__main__":
    main()
