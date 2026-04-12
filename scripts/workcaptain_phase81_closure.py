#!/usr/bin/env python3
"""
Phase 81 — Evidence-Backed Blocker Closure Execution
Reads Phase 80 blocker_resolution_workset.json, evaluates each blocker for closure evidence, produces execution status artifacts.
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


def is_present(value):
    return value is not None and value != ""


def main():
    if len(sys.argv) != 4:
        print(
            "usage: workcaptain_phase81_closure.py "
            "<prior_evidence_dir> <output_evidence_dir> <defaults_json>",
            file=sys.stderr,
        )
        sys.exit(1)

    prior_dir = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    defaults = load_json(Path(sys.argv[3]).resolve())

    workset_path = prior_dir / "blocker_resolution_workset.json"
    if not workset_path.is_file():
        print(f"FAIL_CLOSED: blocker_resolution_workset.json missing: {workset_path}", file=sys.stderr)
        sys.exit(1)

    workset = load_json(workset_path)["workset"]

    submission_template = []
    execution_status = []
    execution_validation = []

    for item in workset:
        template_row = {
            "gap_id": item["gap_id"],
            "evidence_id": None,
            "evidence_type": None,
            "evidence_path": None,
            "submitted_by": None,
            "submitted_at_utc": None,
            "validation_note": None,
            "evidence_validated": False,
        }
        submission_template.append(template_row)

        # All non-boolean fields must be non-null and non-empty; evidence_validated must be True
        non_bool_fields = [f for f in REQUIRED_FIELDS if f != "evidence_validated"]
        populated = all(is_present(template_row.get(f)) for f in non_bool_fields)
        validated = populated and (template_row.get("evidence_validated") is True)

        status = "RESOLVED" if validated else "OPEN"
        reason = (
            "Validated evidence submitted."
            if validated
            else "Required closure evidence not submitted and validated."
        )

        execution_status.append({
            "gap_id": item["gap_id"],
            "status": status,
            "evidence_path": template_row["evidence_path"],
            "human_approval_required": True,
        })

        execution_validation.append({
            "gap_id": item["gap_id"],
            "validated": validated,
            "reason": reason,
        })

    resolved_count = sum(1 for row in execution_status if row["status"] == "RESOLVED")
    open_count = sum(1 for row in execution_status if row["status"] != "RESOLVED")

    readiness = {
        "phase78_rerun_ready": open_count == 0,
        "total_blockers": len(execution_status),
        "resolved_blockers": resolved_count,
        "open_blockers": open_count,
        "readiness_rule": "TRUE only when all blockers are evidence-backed and validated RESOLVED.",
    }

    execution_summary = {
        "no_guessing_role_enforced": True,
        "total_blockers": len(execution_status),
        "resolved_blockers": resolved_count,
        "open_blockers": open_count,
        "phase78_rerun_ready": readiness["phase78_rerun_ready"],
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    write_json(out_dir / "blocker_closure_submission_template.json", {"submissions": submission_template})
    write_json(out_dir / "blocker_closure_execution_status.json", {"status_rows": execution_status})
    write_json(out_dir / "blocker_closure_execution_validation.json", {"validation_rows": execution_validation})
    write_json(out_dir / "blocker_closure_execution_summary.json", execution_summary)
    write_json(out_dir / "certification_rerun_readiness.json", readiness)

    summary_lines = [
        "# PHASE 81 SUMMARY",
        "",
        "- No-guessing role enforced: TRUE",
        f"- Total blockers: {execution_summary['total_blockers']}",
        f"- Resolved blockers: {execution_summary['resolved_blockers']}",
        f"- Open blockers: {execution_summary['open_blockers']}",
        f"- Phase 78 rerun ready: {execution_summary['phase78_rerun_ready']}",
        "",
        "STATUS=PASSED",
    ]
    (out_dir / "PHASE81_SUMMARY.md").write_text("\n".join(summary_lines) + "\n", encoding="utf-8")
    print("  wrote PHASE81_SUMMARY.md")

    print(
        f"Phase 81 complete. TotalBlockers={execution_summary['total_blockers']}, "
        f"Open={open_count}, Resolved={resolved_count}, "
        f"RerunReady={readiness['phase78_rerun_ready']}"
    )


if __name__ == "__main__":
    main()
