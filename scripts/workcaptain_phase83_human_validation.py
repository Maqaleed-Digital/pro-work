#!/usr/bin/env python3
"""
Phase 83 — Real Blocker Evidence Intake + Human Validation
Reads Phase 82 blocker_specific_submission_records.json, evaluates each blocker for evidence completeness and human approval.
No HTTP calls. No guessing. Pure analytics.
"""

import json
import sys
from pathlib import Path

EVIDENCE_FIELDS = [
    "gap_id",
    "evidence_id",
    "evidence_type",
    "evidence_path",
    "submitted_by",
    "submitted_at_utc",
    "validation_note",
]

HUMAN_FIELDS = [
    "human_validation_status",
    "human_validated_by",
    "human_validated_at_utc",
    "human_validation_comment",
]


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data):
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"  wrote {path.name}")


def present(value):
    return value is not None and value != ""


def main():
    if len(sys.argv) != 4:
        print(
            "usage: workcaptain_phase83_human_validation.py "
            "<prior_evidence_dir> <output_evidence_dir> <defaults_json>",
            file=sys.stderr,
        )
        sys.exit(1)

    prior_dir = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    defaults = load_json(Path(sys.argv[3]).resolve())

    records_path = prior_dir / "blocker_specific_submission_records.json"
    if not records_path.is_file():
        print(f"FAIL_CLOSED: blocker_specific_submission_records.json missing: {records_path}", file=sys.stderr)
        sys.exit(1)

    prior_records = load_json(records_path)["records"]

    intake_records = []
    human_validation_records = []
    closure_status = []

    for row in prior_records:
        intake = {
            "gap_id": row["gap_id"],
            "evidence_id": row.get("evidence_id"),
            "evidence_type": row.get("evidence_type"),
            "evidence_path": row.get("evidence_path"),
            "submitted_by": row.get("submitted_by"),
            "submitted_at_utc": row.get("submitted_at_utc"),
            "validation_note": row.get("validation_note"),
        }
        intake_records.append(intake)

        human = {
            "gap_id": row["gap_id"],
            "human_validation_status": None,
            "human_validated_by": None,
            "human_validated_at_utc": None,
            "human_validation_comment": None,
        }
        human_validation_records.append(human)

        # Evidence must be complete (gap_id excluded — always present)
        evidence_ok = all(
            present(intake.get(f)) for f in EVIDENCE_FIELDS if f != "gap_id"
        )
        # Human approval: status must equal "APPROVED" and identity/timestamp/comment must be present
        human_ok = (
            human.get("human_validation_status") == defaults["approved_value"]
            and all(present(human.get(f)) for f in HUMAN_FIELDS if f != "human_validation_status")
        )

        status = "RESOLVED" if (evidence_ok and human_ok) else "OPEN"
        reason = (
            "Evidence and human approval both present."
            if status == "RESOLVED"
            else "Evidence and/or human approval missing."
        )

        closure_status.append({
            "gap_id": row["gap_id"],
            "status": status,
            "evidence_present": evidence_ok,
            "human_approved": human_ok,
            "reason": reason,
        })

    resolved = sum(1 for row in closure_status if row["status"] == "RESOLVED")
    open_count = sum(1 for row in closure_status if row["status"] != "RESOLVED")

    readiness = {
        "phase78_rerun_ready": open_count == 0,
        "total_blockers": len(closure_status),
        "resolved_blockers": resolved,
        "open_blockers": open_count,
        "readiness_rule": "TRUE only when all blockers have evidence and explicit human approval.",
    }

    summary = {
        "total_blockers": len(closure_status),
        "resolved_blockers": resolved,
        "open_blockers": open_count,
        "phase78_rerun_ready": readiness["phase78_rerun_ready"],
        "human_validation_enforced": True,
        "no_guessing_role_enforced": True,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    write_json(out_dir / "blocker_evidence_intake_records.json", {"intake_records": intake_records})
    write_json(out_dir / "blocker_human_validation_records.json", {"human_validation_records": human_validation_records})
    write_json(out_dir / "blocker_validated_closure_status.json", {"closure_status": closure_status})
    write_json(out_dir / "blocker_validated_closure_summary.json", summary)
    write_json(out_dir / "certification_rerun_readiness.json", readiness)

    summary_lines = [
        "# PHASE 83 SUMMARY",
        "",
        "- No-guessing role enforced: TRUE",
        "- Human validation enforced: TRUE",
        f"- Total blockers: {summary['total_blockers']}",
        f"- Resolved blockers: {summary['resolved_blockers']}",
        f"- Open blockers: {summary['open_blockers']}",
        f"- Phase 78 rerun ready: {summary['phase78_rerun_ready']}",
        "",
        "STATUS=PASSED",
    ]
    (out_dir / "PHASE83_SUMMARY.md").write_text("\n".join(summary_lines) + "\n", encoding="utf-8")
    print("  wrote PHASE83_SUMMARY.md")

    print(
        f"Phase 83 complete. TotalBlockers={summary['total_blockers']}, "
        f"Open={open_count}, Resolved={resolved}, "
        f"RerunReady={readiness['phase78_rerun_ready']}"
    )


if __name__ == "__main__":
    main()
