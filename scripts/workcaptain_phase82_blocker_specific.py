#!/usr/bin/env python3
"""
Phase 82 — Blocker-Specific Evidence Submission + Validated Closure
Reads Phase 81 blocker_closure_submission_template.json, evaluates each blocker independently for closure evidence.
No HTTP calls. No guessing. Pure analytics.
"""

import json
import sys
from pathlib import Path

REQUIRED_FIELDS = [
    "gap_id",
    "evidence_id",
    "evidence_type",
    "evidence_path",
    "submitted_by",
    "submitted_at_utc",
    "validation_note",
    "evidence_validated",
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
            "usage: workcaptain_phase82_blocker_specific.py "
            "<prior_evidence_dir> <output_evidence_dir> <defaults_json>",
            file=sys.stderr,
        )
        sys.exit(1)

    prior_dir = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    defaults = load_json(Path(sys.argv[3]).resolve())

    template_path = prior_dir / "blocker_closure_submission_template.json"
    if not template_path.is_file():
        print(f"FAIL_CLOSED: blocker_closure_submission_template.json missing: {template_path}", file=sys.stderr)
        sys.exit(1)

    prior_submissions = load_json(template_path)["submissions"]

    submission_records = []
    validation_results = []
    closure_status = []

    for row in prior_submissions:
        record = {
            "gap_id": row["gap_id"],
            "evidence_id": row.get("evidence_id"),
            "evidence_type": row.get("evidence_type"),
            "evidence_path": row.get("evidence_path"),
            "submitted_by": row.get("submitted_by"),
            "submitted_at_utc": row.get("submitted_at_utc"),
            "validation_note": row.get("validation_note"),
            "evidence_validated": row.get("evidence_validated", False),
        }
        submission_records.append(record)

        non_bool_fields = [f for f in REQUIRED_FIELDS if f != "evidence_validated"]
        missing = [f for f in non_bool_fields if not present(record.get(f))]
        validated_flag = record.get("evidence_validated") is True
        passed = len(missing) == 0 and validated_flag

        validation_results.append({
            "gap_id": record["gap_id"],
            "validated": passed,
            "missing_fields": missing,
            "reason": (
                "Validated blocker-specific evidence present."
                if passed
                else "Required blocker-specific evidence missing or not validated."
            ),
        })

        closure_status.append({
            "gap_id": record["gap_id"],
            "status": "RESOLVED" if passed else "OPEN",
            "evidence_path": record["evidence_path"],
            "human_approval_required": True,
        })

    resolved = sum(1 for row in closure_status if row["status"] == "RESOLVED")
    open_count = sum(1 for row in closure_status if row["status"] != "RESOLVED")

    readiness = {
        "phase78_rerun_ready": open_count == 0,
        "total_blockers": len(closure_status),
        "resolved_blockers": resolved,
        "open_blockers": open_count,
        "readiness_rule": "TRUE only when all blocker-specific submissions are validated RESOLVED.",
    }

    summary = {
        "total_blockers": len(closure_status),
        "resolved_blockers": resolved,
        "open_blockers": open_count,
        "phase78_rerun_ready": readiness["phase78_rerun_ready"],
        "no_guessing_role_enforced": True,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    write_json(out_dir / "blocker_specific_submission_records.json", {"records": submission_records})
    write_json(out_dir / "blocker_specific_validation_results.json", {"validation_results": validation_results})
    write_json(out_dir / "blocker_specific_closure_status.json", {"closure_status": closure_status})
    write_json(out_dir / "blocker_specific_closure_summary.json", summary)
    write_json(out_dir / "certification_rerun_readiness.json", readiness)

    summary_lines = [
        "# PHASE 82 SUMMARY",
        "",
        "- No-guessing role enforced: TRUE",
        f"- Total blockers: {summary['total_blockers']}",
        f"- Resolved blockers: {summary['resolved_blockers']}",
        f"- Open blockers: {summary['open_blockers']}",
        f"- Phase 78 rerun ready: {summary['phase78_rerun_ready']}",
        "",
        "STATUS=PASSED",
    ]
    (out_dir / "PHASE82_SUMMARY.md").write_text("\n".join(summary_lines) + "\n", encoding="utf-8")
    print("  wrote PHASE82_SUMMARY.md")

    print(
        f"Phase 82 complete. TotalBlockers={summary['total_blockers']}, "
        f"Open={open_count}, Resolved={resolved}, "
        f"RerunReady={readiness['phase78_rerun_ready']}"
    )


if __name__ == "__main__":
    main()
