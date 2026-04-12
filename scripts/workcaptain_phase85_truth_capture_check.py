#!/usr/bin/env python3
import json
import sys
from pathlib import Path

def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))

def present(value):
    return value is not None and value != ""

def threshold_pass(operator, uplift_value, target_value):
    if operator == ">=":
        return uplift_value >= target_value
    if operator == "<=":
        return uplift_value <= target_value
    raise ValueError(f"Unsupported operator: {operator}")

def main():
    if len(sys.argv) != 5:
        print("usage: workcaptain_phase85_truth_capture_check.py <repo_root> <output_evidence_dir> <contract_json> <uplift_file>", file=sys.stderr)
        sys.exit(1)

    repo_root = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    contract = load_json(Path(sys.argv[3]).resolve())
    uplift_file = Path(sys.argv[4]).resolve()

    if not uplift_file.exists():
        print(f"FAIL_CLOSED: uplift submission file missing: {uplift_file}", file=sys.stderr)
        sys.exit(1)

    uplift = load_json(uplift_file)
    if "submissions" not in uplift or not isinstance(uplift["submissions"], list):
        print("FAIL_CLOSED: uplift file must contain a top-level 'submissions' array", file=sys.stderr)
        sys.exit(1)

    submissions_by_gap = {row.get("gap_id"): row for row in uplift["submissions"]}

    validation_rows = []
    status_rows = []

    for gap in contract["required_gap_rows"]:
        gap_id = gap["gap_id"]
        row = submissions_by_gap.get(gap_id)
        errors = []

        if row is None:
            errors.append("missing submission row")
            validation_rows.append({"gap_id": gap_id, "validated": False, "errors": errors})
            status_rows.append({"gap_id": gap_id, "status": "OPEN", "reason": "No submission row present."})
            continue

        for field in contract["required_submission_fields"]:
            if not present(row.get(field)):
                errors.append(f"missing submission field: {field}")

        evidence_path_rel = row.get("evidence_path", "")
        approval_path_rel = row.get("approval_path", "")
        evidence_path = repo_root / evidence_path_rel
        approval_path = repo_root / approval_path_rel

        if present(evidence_path_rel) and not evidence_path.exists():
            errors.append(f"evidence file not found: {evidence_path_rel}")

        if not present(approval_path_rel):
            errors.append("missing submission field: approval_path")
        elif not approval_path.exists():
            errors.append(f"approval file not found: {approval_path_rel}")

        approval_data = None
        if approval_path.exists():
            try:
                approval_data = load_json(approval_path)
            except Exception as exc:
                errors.append(f"approval file not valid json: {approval_path_rel} ({exc})")

        if approval_data is not None:
            for field in contract["required_approval_fields"]:
                if field not in approval_data or not present(approval_data.get(field)):
                    if field == "approved" and approval_data.get(field) is False:
                        pass
                    else:
                        errors.append(f"missing approval field: {field}")
            if approval_data.get("approved") is not True:
                errors.append("approval file does not contain approved=true")

        try:
            uplift_value = float(row.get("uplift_value"))
        except Exception:
            errors.append(f"uplift_value not numeric: {row.get('uplift_value')}")
            uplift_value = None

        if uplift_value is not None:
            if not threshold_pass(gap["target_operator"], uplift_value, gap["target_value"]):
                errors.append(
                    f"uplift_value {uplift_value} does not satisfy {gap['target_operator']} {gap['target_value']}"
                )

        expected_approval = gap["required_approval_file"]
        if present(approval_path_rel) and approval_path_rel != expected_approval:
            errors.append(f"approval_path must equal {expected_approval}")

        validated = len(errors) == 0
        validation_rows.append({
            "gap_id": gap_id,
            "validated": validated,
            "errors": errors
        })
        status_rows.append({
            "gap_id": gap_id,
            "status": "CLOSED" if validated else "OPEN",
            "reason": "Real-world truth captured and validated." if validated else "Real-world truth incomplete or invalid."
        })

    closed_gaps = sum(1 for row in status_rows if row["status"] == "CLOSED")
    open_gaps = sum(1 for row in status_rows if row["status"] != "CLOSED")

    summary = {
        "total_gaps": len(status_rows),
        "closed_gaps": closed_gaps,
        "open_gaps": open_gaps,
        "phase78_final_rerun_ready": open_gaps == 0,
        "real_world_truth_captured": closed_gaps == len(status_rows),
        "no_guessing_role_enforced": True
    }

    (out_dir / "phase85_truth_capture_validation.json").write_text(
        json.dumps({"validation_rows": validation_rows}, indent=2), encoding="utf-8"
    )
    (out_dir / "phase85_truth_capture_status.json").write_text(
        json.dumps({"status_rows": status_rows}, indent=2), encoding="utf-8"
    )
    (out_dir / "phase85_truth_capture_summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )

    lines = [
        "# PHASE 85 TRUTH CAPTURE SUMMARY",
        "",
        "- No-guessing role enforced: TRUE",
        f"- Total gaps: {summary['total_gaps']}",
        f"- Closed gaps: {summary['closed_gaps']}",
        f"- Open gaps: {summary['open_gaps']}",
        f"- Phase 78 final rerun ready: {summary['phase78_final_rerun_ready']}"
    ]
    (out_dir / "PHASE85_TRUTH_CAPTURE_SUMMARY.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
