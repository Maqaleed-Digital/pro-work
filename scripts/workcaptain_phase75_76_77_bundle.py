#!/usr/bin/env python3
"""
Phase 75-76-77 Bundle — Recovery Execution Governance + Stabilization Assurance + Board Re-Certification
Reads Phase 74 evidence, produces governance controls, assurance, and board recertification artifacts.
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
            "usage: workcaptain_phase75_76_77_bundle.py "
            "<prior_evidence_dir> <output_evidence_dir> <thresholds_json>",
            file=sys.stderr,
        )
        sys.exit(1)

    prior_dir = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    thresholds = load_json(Path(sys.argv[3]).resolve())
    priority_scores = thresholds["priority_scores"]
    cert_rules = thresholds["certification_rules"]

    # Validate required prior evidence
    required_files = [
        "degradation_drivers.json",
        "critical_signal_remediation.json",
        "governance_recovery_plan.json",
        "portfolio_stabilization_plan.json",
        "executive_recovery_summary.json",
    ]
    for req in required_files:
        if not (prior_dir / req).is_file():
            print(f"FAIL_CLOSED: required prior evidence missing: {prior_dir / req}", file=sys.stderr)
            sys.exit(1)

    degradation = load_json(prior_dir / "degradation_drivers.json")
    remediation = load_json(prior_dir / "critical_signal_remediation.json")
    portfolio = load_json(prior_dir / "portfolio_stabilization_plan.json")
    executive = load_json(prior_dir / "executive_recovery_summary.json")

    drivers = degradation["drivers"]
    remediation_items = remediation["remediation_items"]

    # ── Phase 75: Recovery Execution Governance ──────────────────────────────
    control_items = []
    for item in remediation_items:
        control_items.append({
            "control_id": f"CTRL_{item['driver_id'].upper()}",
            "driver_id": item["driver_id"],
            "priority": item["priority"],
            "metric_name": item["metric_name"],
            "metric_value": item["metric_value"],
            "execution_posture": "HUMAN_APPROVAL_REQUIRED",
            "evidence_dependency": item["evidence_source"],
            "control_action": item["remediation_action"],
            "status": "PLANNED_GOVERNED_EXECUTION",
        })

    recovery_execution_controls = {
        "control_count": len(control_items),
        "execution_posture": "HUMAN_APPROVAL_REQUIRED",
        "controls": control_items,
    }

    remediation_execution_register = {
        "register_items": [
            {
                "driver_id": item["driver_id"],
                "priority": item["priority"],
                "execution_state": "NOT_EXECUTED_IN_THIS_PHASE",
                "reason": "Phase 75 establishes governance controls, not autonomous remediation completion.",
            }
            for item in remediation_items
        ]
    }

    write_json(out_dir / "recovery_execution_controls.json", recovery_execution_controls)
    write_json(out_dir / "remediation_execution_register.json", remediation_execution_register)

    # ── Phase 76: Stabilization Assurance ────────────────────────────────────
    total_priority_score = sum(priority_scores.get(item["priority"], 0) for item in remediation_items)
    p0_count = sum(1 for item in remediation_items if item["priority"] == "P0_IMMEDIATE")
    coverage_ratio = portfolio["portfolio_coverage_ratio"]

    # Confidence derived from coverage ratio and driver pressure
    driver_pressure = min(1.0, len(drivers) / 10.0)
    confidence = min(1.0, round((coverage_ratio + (1.0 - driver_pressure)) / 2.0, 4))

    if confidence >= cert_rules["high_confidence_min"]:
        confidence_band = "HIGH"
    elif confidence >= cert_rules["medium_confidence_min"]:
        confidence_band = "MEDIUM"
    else:
        confidence_band = "LOW"

    stabilization_assurance = {
        "assurance_posture": "MEASURED_STABILIZATION_REVIEW_COMPLETE",
        "remediation_item_count": len(remediation_items),
        "p0_count": p0_count,
        "priority_score_total": total_priority_score,
        "portfolio_coverage_ratio": coverage_ratio,
        "assurance_confidence": confidence,
        "assurance_confidence_band": confidence_band,
    }

    measured_validation = {
        "validation_result": "PARTIAL_STABILIZATION" if p0_count > 0 else "STABILIZATION_PROGRESSING",
        "validation_rule": "No full stabilization claim without future persisted improvement evidence.",
        "current_state": executive["current_state"],
        "top_recovery_priority": executive["top_recovery_priority"],
    }

    write_json(out_dir / "stabilization_assurance.json", stabilization_assurance)
    write_json(out_dir / "measured_validation.json", measured_validation)

    # ── Phase 77: Board Re-Certification ─────────────────────────────────────
    if confidence >= cert_rules["high_confidence_min"] and p0_count <= cert_rules["full_certification_max_p0"]:
        certification_status = "CERTIFIED"
    elif confidence >= cert_rules["medium_confidence_min"] and p0_count <= cert_rules["conditional_certification_max_p0"]:
        certification_status = "CONDITIONALLY_CERTIFIED"
    else:
        certification_status = "NOT_RESTORED"

    board_recognition_packet = {
        "certification_status": certification_status,
        "assurance_confidence": confidence,
        "assurance_confidence_band": confidence_band,
        "coverage_ratio": coverage_ratio,
        "current_state": executive["current_state"],
        "decision_posture": "HUMAN_AUTHORITY_FINAL",
    }

    final_operating_seal = {
        "platform": "ProWork / WorkCaptain",
        "bundle": "PHASE_75_76_77",
        "status": certification_status,
        "confidence_band": confidence_band,
        "advisory_mode": "HUMAN_APPROVAL_REQUIRED",
        "seal_rule": "This seal summarizes current validated posture only.",
    }

    executive_board_summary = {
        "headline": certification_status,
        "confidence_band": confidence_band,
        "coverage_ratio": coverage_ratio,
        "p0_count": p0_count,
        "board_message": "Board posture derived from persisted intelligence, recovery, and stabilization evidence only.",
    }

    write_json(out_dir / "board_recognition_packet.json", board_recognition_packet)
    write_json(out_dir / "final_operating_seal.json", final_operating_seal)
    write_json(out_dir / "executive_board_summary.json", executive_board_summary)

    # ── Summaries ─────────────────────────────────────────────────────────────
    (out_dir / "PHASE75_SUMMARY.md").write_text(
        "# PHASE 75 SUMMARY\n\n"
        f"- Recovery execution controls: {len(control_items)}\n"
        "- Execution posture: HUMAN_APPROVAL_REQUIRED\n"
        "\nSTATUS=PASSED\n",
        encoding="utf-8",
    )
    print("  wrote PHASE75_SUMMARY.md")

    (out_dir / "PHASE76_SUMMARY.md").write_text(
        "# PHASE 76 SUMMARY\n\n"
        f"- Assurance confidence: {confidence}\n"
        f"- Confidence band: {confidence_band}\n"
        f"- Validation result: {measured_validation['validation_result']}\n"
        "\nSTATUS=PASSED\n",
        encoding="utf-8",
    )
    print("  wrote PHASE76_SUMMARY.md")

    (out_dir / "PHASE77_SUMMARY.md").write_text(
        "# PHASE 77 SUMMARY\n\n"
        f"- Certification status: {certification_status}\n"
        f"- Confidence band: {confidence_band}\n"
        f"- Coverage ratio: {coverage_ratio}\n"
        "\nSTATUS=PASSED\n",
        encoding="utf-8",
    )
    print("  wrote PHASE77_SUMMARY.md")

    print(
        f"Phase 75-76-77 complete. CertificationStatus={certification_status}, "
        f"Confidence={confidence} ({confidence_band}), P0count={p0_count}"
    )


if __name__ == "__main__":
    main()
