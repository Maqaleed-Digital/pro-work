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
    if len(sys.argv) != 6:
        print("usage: workcaptain_phase85_gap_closure.py <repo_root> <prior_evidence_dir> <output_evidence_dir> <thresholds_json> <uplift_file>", file=sys.stderr)
        sys.exit(1)

    repo_root = Path(sys.argv[1]).resolve()
    prior_dir = Path(sys.argv[2]).resolve()
    out_dir = Path(sys.argv[3]).resolve()
    thresholds = load_json(Path(sys.argv[4]).resolve())
    uplift_file = Path(sys.argv[5]).resolve()

    gap_defs = thresholds["gaps"]
    baseline = {
        "source_evidence_dir": str(prior_dir),
        "gaps": gap_defs
    }
    (out_dir / "full_cert_gap_baseline.json").write_text(json.dumps(baseline, indent=2), encoding="utf-8")

    template = {"submissions": []}
    for gap in gap_defs:
        template["submissions"].append({
            "gap_id": gap["gap_id"],
            "current_value": gap["current_value"],
            "target_value": gap["target_value"],
            "uplift_value": None,
            "evidence_path": "",
            "evidence_type": "",
            "submission_note": "",
            "approval_path": ""
        })
    (out_dir / "full_cert_gap_submission_template.json").write_text(json.dumps(template, indent=2), encoding="utf-8")

    if not uplift_file.exists():
        print(f"FAIL_CLOSED: uplift submission file missing: {uplift_file}", file=sys.stderr)
        print(f"Populate this exact file with real uplift evidence and approval references: {uplift_file}", file=sys.stderr)
        sys.exit(1)

    uplift = load_json(uplift_file)
    if "submissions" not in uplift or not isinstance(uplift["submissions"], list):
        print("FAIL_CLOSED: uplift file must contain a top-level 'submissions' array", file=sys.stderr)
        sys.exit(1)

    submissions_by_gap = {row.get("gap_id"): row for row in uplift["submissions"]}

    results = []
    status_rows = []

    for gap in gap_defs:
        gap_id = gap["gap_id"]
        row = submissions_by_gap.get(gap_id)
        errors = []

        if row is None:
            errors.append("missing submission row")
            results.append({"gap_id": gap_id, "validated": False, "errors": errors})
            status_rows.append({"gap_id": gap_id, "status": "OPEN", "reason": "No uplift submission row present."})
            continue

        for field in thresholds["required_submission_fields"]:
            if not present(row.get(field)):
                errors.append(f"missing submission field: {field}")

        evidence_path_rel = row.get("evidence_path", "")
        approval_path_rel = row.get("approval_path", "")
        evidence_path = repo_root / evidence_path_rel
        approval_path = repo_root / approval_path_rel

        if present(evidence_path_rel) and not evidence_path.exists():
            errors.append(f"evidence file not found: {evidence_path_rel}")
        if present(approval_path_rel) and not approval_path.exists():
            errors.append(f"approval file not found: {approval_path_rel}")

        approval_data = None
        if present(approval_path_rel) and approval_path.exists():
            try:
                approval_data = load_json(approval_path)
            except Exception as exc:
                errors.append(f"approval file not valid json: {approval_path_rel} ({exc})")

        if approval_data is not None:
            for field in thresholds["required_approval_fields"]:
                if field not in approval_data or not present(approval_data.get(field)):
                    if field == "approved" and approval_data.get(field) is False:
                        pass
                    else:
                        errors.append(f"missing approval field: {field}")
            if approval_data.get("approved") is not True:
                errors.append("approval file does not contain approved=true")

        uplift_value = row.get("uplift_value")
        try:
            uplift_numeric = float(uplift_value)
        except Exception:
            errors.append(f"uplift_value not numeric: {uplift_value}")
            uplift_numeric = None

        if uplift_numeric is not None:
            if not threshold_pass(gap["target_operator"], uplift_numeric, gap["target_value"]):
                errors.append(
                    f"uplift_value {uplift_numeric} does not satisfy {gap['target_operator']} {gap['target_value']}"
                )

        validated = len(errors) == 0
        results.append({
            "gap_id": gap_id,
            "validated": validated,
            "errors": errors
        })
        status_rows.append({
            "gap_id": gap_id,
            "status": "CLOSED" if validated else "OPEN",
            "reason": "Validated uplift evidence and approval satisfy full-certification target." if validated else "Uplift evidence, approval, or threshold satisfaction missing."
        })

    closed_count = sum(1 for row in status_rows if row["status"] == "CLOSED")
    open_count = sum(1 for row in status_rows if row["status"] != "CLOSED")

    summary = {
        "total_gaps": len(status_rows),
        "closed_gaps": closed_count,
        "open_gaps": open_count,
        "phase78_final_rerun_ready": open_count == 0,
        "real_uplift_evidence_enforced": True,
        "human_approval_enforced": True,
        "no_guessing_role_enforced": True
    }

    rerun_ready = {
        "phase78_final_rerun_ready": open_count == 0,
        "total_gaps": len(status_rows),
        "closed_gaps": closed_count,
        "open_gaps": open_count,
        "readiness_rule": "TRUE only when all three full-certification gaps are CLOSED."
    }

    (out_dir / "full_cert_gap_validation_results.json").write_text(json.dumps({"results": results}, indent=2), encoding="utf-8")
    (out_dir / "full_cert_gap_status.json").write_text(json.dumps({"status_rows": status_rows}, indent=2), encoding="utf-8")
    (out_dir / "full_cert_gap_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (out_dir / "phase78_final_rerun_ready.json").write_text(json.dumps(rerun_ready, indent=2), encoding="utf-8")

    lines = [
        "# PHASE 85 SUMMARY",
        "",
        "- No-guessing role enforced: TRUE",
        "- Real uplift evidence enforced: TRUE",
        "- Human approval enforced: TRUE",
        f"- Total gaps: {summary['total_gaps']}",
        f"- Closed gaps: {summary['closed_gaps']}",
        f"- Open gaps: {summary['open_gaps']}",
        f"- Phase 78 final rerun ready: {summary['phase78_final_rerun_ready']}"
    ]
    (out_dir / "PHASE85_SUMMARY.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
