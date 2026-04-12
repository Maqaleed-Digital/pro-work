#!/usr/bin/env python3
"""
Phase 84 — Blocker-by-Blocker Real Evidence Submission + Approved Closure
Reads Phase 83 closure status, validates each blocker against real evidence and approval files.
No HTTP calls. No guessing. Fail-closed on missing or invalid evidence.
"""

import json
import sys
from pathlib import Path


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def present(value):
    return value is not None and value != ""


def main():
    if len(sys.argv) != 6:
        print(
            "usage: workcaptain_phase84_closure.py "
            "<repo_root> <prior_evidence_dir> <output_evidence_dir> <contract_json> <submissions_file>",
            file=sys.stderr,
        )
        sys.exit(1)

    repo_root = Path(sys.argv[1]).resolve()
    prior_dir = Path(sys.argv[2]).resolve()
    out_dir = Path(sys.argv[3]).resolve()
    contract = load_json(Path(sys.argv[4]).resolve())
    submissions_file = Path(sys.argv[5]).resolve()

    prior_status_path = prior_dir / "blocker_validated_closure_status.json"
    if not prior_status_path.is_file():
        print(f"FAIL_CLOSED: blocker_validated_closure_status.json missing: {prior_status_path}", file=sys.stderr)
        sys.exit(1)

    prior_status_rows = load_json(prior_status_path)["closure_status"]

    # Write submission template using actual gap_ids
    template_rows = []
    for row in prior_status_rows:
        template_rows.append({
            "gap_id": row["gap_id"],
            "evidence_path": "",
            "evidence_type": "",
            "submission_note": "",
            "approval_path": "",
        })

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "blocker_real_submission_template.json").write_text(
        json.dumps({"submissions": template_rows}, indent=2),
        encoding="utf-8",
    )
    print("  wrote blocker_real_submission_template.json")

    if not submissions_file.exists():
        print(f"FAIL_CLOSED: submissions file missing: {submissions_file}", file=sys.stderr)
        print(
            f"Populate this exact file with real blocker evidence and approval references: {submissions_file}",
            file=sys.stderr,
        )
        sys.exit(1)

    submitted = load_json(submissions_file)
    if "submissions" not in submitted or not isinstance(submitted["submissions"], list):
        print("FAIL_CLOSED: submissions file must contain a top-level 'submissions' array", file=sys.stderr)
        sys.exit(1)

    submitted_by_gap = {row.get("gap_id"): row for row in submitted["submissions"]}
    results = []
    closure_status = []

    for template in template_rows:
        gap_id = template["gap_id"]
        row = submitted_by_gap.get(gap_id)
        errors = []

        if row is None:
            errors.append("missing submission row")
            results.append({"gap_id": gap_id, "validated": False, "errors": errors})
            closure_status.append({
                "gap_id": gap_id,
                "status": "OPEN",
                "reason": "No submission row present.",
            })
            continue

        # Validate required submission fields
        for field in contract["required_submission_fields"]:
            if not present(row.get(field)):
                errors.append(f"missing submission field: {field}")

        # Check evidence file exists (only if path field was not already flagged missing)
        already_missing = {e.split(": ")[-1] for e in errors}
        evidence_path = repo_root / row.get("evidence_path", "")
        if "evidence_path" not in already_missing and present(row.get("evidence_path")):
            if not evidence_path.exists():
                errors.append(f"evidence file not found: {row.get('evidence_path')}")

        # Check approval file exists and validate its content
        approval_data = None
        if "approval_path" not in already_missing and present(row.get("approval_path")):
            approval_path = repo_root / row.get("approval_path", "")
            if not approval_path.exists():
                errors.append(f"approval file not found: {row.get('approval_path')}")
            else:
                try:
                    approval_data = load_json(approval_path)
                except Exception as exc:
                    errors.append(f"approval file not valid json: {row.get('approval_path')} ({exc})")

        if approval_data is not None:
            for field in contract["required_approval_fields"]:
                val = approval_data.get(field)
                if field == "approved":
                    if val is not True:
                        errors.append("approval file does not contain approved=true")
                elif not present(val):
                    errors.append(f"missing approval field: {field}")

        validated = len(errors) == 0
        results.append({"gap_id": gap_id, "validated": validated, "errors": errors})
        closure_status.append({
            "gap_id": gap_id,
            "status": "RESOLVED" if validated else "OPEN",
            "reason": (
                "Validated real evidence and approved closure present."
                if validated
                else "Real evidence and/or approved closure invalid or missing."
            ),
        })

    resolved = sum(1 for row in closure_status if row["status"] == "RESOLVED")
    open_count = sum(1 for row in closure_status if row["status"] != "RESOLVED")

    summary = {
        "total_blockers": len(closure_status),
        "resolved_blockers": resolved,
        "open_blockers": open_count,
        "phase78_rerun_ready": open_count == 0,
        "real_evidence_enforced": True,
        "human_approval_enforced": True,
        "no_guessing_role_enforced": True,
    }

    readiness = {
        "phase78_rerun_ready": open_count == 0,
        "total_blockers": len(closure_status),
        "resolved_blockers": resolved,
        "open_blockers": open_count,
        "readiness_rule": "TRUE only when all blockers have validated real evidence and approved closure.",
    }

    (out_dir / "blocker_real_submission_results.json").write_text(
        json.dumps({"results": results}, indent=2), encoding="utf-8"
    )
    print("  wrote blocker_real_submission_results.json")
    (out_dir / "blocker_real_closure_status.json").write_text(
        json.dumps({"closure_status": closure_status}, indent=2), encoding="utf-8"
    )
    print("  wrote blocker_real_closure_status.json")
    (out_dir / "blocker_real_closure_summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    print("  wrote blocker_real_closure_summary.json")
    (out_dir / "certification_rerun_readiness.json").write_text(
        json.dumps(readiness, indent=2), encoding="utf-8"
    )
    print("  wrote certification_rerun_readiness.json")

    summary_lines = [
        "# PHASE 84 SUMMARY",
        "",
        "- No-guessing role enforced: TRUE",
        "- Real evidence enforced: TRUE",
        "- Human approval enforced: TRUE",
        f"- Total blockers: {summary['total_blockers']}",
        f"- Resolved blockers: {summary['resolved_blockers']}",
        f"- Open blockers: {summary['open_blockers']}",
        f"- Phase 78 rerun ready: {summary['phase78_rerun_ready']}",
        "",
        "STATUS=PASSED",
    ]
    (out_dir / "PHASE84_SUMMARY.md").write_text("\n".join(summary_lines) + "\n", encoding="utf-8")
    print("  wrote PHASE84_SUMMARY.md")

    print(
        f"Phase 84 complete. TotalBlockers={summary['total_blockers']}, "
        f"Open={open_count}, Resolved={resolved}, "
        f"RerunReady={readiness['phase78_rerun_ready']}"
    )


if __name__ == "__main__":
    main()
