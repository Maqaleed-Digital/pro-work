#!/usr/bin/env python3
"""
Phase 80 — Real Blocker Resolution + Full Certification Readiness
Reads Phase 79 blocker_closure_register.json, produces resolution workset and certification rerun readiness.
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
            "usage: workcaptain_phase80_resolution.py "
            "<prior_evidence_dir> <output_evidence_dir> <defaults_json>",
            file=sys.stderr,
        )
        sys.exit(1)

    prior_dir = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    defaults = load_json(Path(sys.argv[3]).resolve())

    # Validate required prior evidence
    for req in ["blocker_closure_register.json", "blocker_closure_validation.json", "certification_readiness_state.json"]:
        if not (prior_dir / req).is_file():
            print(f"FAIL_CLOSED: required prior evidence missing: {prior_dir / req}", file=sys.stderr)
            sys.exit(1)

    # Phase 79 wrote {"closure_register": [...]} — unwrap the key
    closure_register_doc = load_json(prior_dir / "blocker_closure_register.json")
    blockers = closure_register_doc["closure_register"]

    workset = []
    evidence_contract = []
    status_rows = []
    validation_rows = []

    for idx, blocker in enumerate(blockers, start=1):
        gap_id = blocker["gap_id"]

        workset.append({
            "work_item_id": f"BLK-{idx:03d}",
            "gap_id": gap_id,
            "current_status": defaults["default_status"],
            "closure_required": blocker["closure_required"],
            "resolution_objective": f"Produce explicit closure evidence for {gap_id}",
            "approval_posture": "HUMAN_APPROVAL_REQUIRED",
        })

        evidence_contract.append({
            "gap_id": gap_id,
            "required_evidence_fields": defaults["required_evidence_fields"],
            "evidence_submission_status": "NOT_SUBMITTED",
        })

        status_rows.append({
            "gap_id": gap_id,
            "status": "OPEN",
            "closure_evidence_present": False,
            "closure_evidence_path": None,
            "human_validation_required": True,
        })

        validation_rows.append({
            "gap_id": gap_id,
            "validated": False,
            "validation_state": "NOT_VALIDATED",
            "reason": "No closure evidence submitted in Phase 80 baseline execution.",
        })

    open_blockers = sum(1 for row in status_rows if row["status"] != "RESOLVED")
    resolved_blockers = len(status_rows) - open_blockers

    rerun_readiness = {
        "phase78_rerun_ready": open_blockers == 0,
        "total_blockers": len(status_rows),
        "resolved_blockers": resolved_blockers,
        "open_blockers": open_blockers,
        "readiness_basis": "All blockers must be validated RESOLVED before certification rerun.",
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    write_json(out_dir / "blocker_resolution_workset.json", {"workset": workset})
    write_json(out_dir / "blocker_resolution_evidence_contract.json", {"contracts": evidence_contract})
    write_json(out_dir / "blocker_resolution_status.json", {"status_rows": status_rows})
    write_json(out_dir / "blocker_resolution_validation.json", {"validation_rows": validation_rows})
    write_json(out_dir / "certification_rerun_readiness.json", rerun_readiness)

    summary_lines = [
        "# PHASE 80 SUMMARY",
        "",
        f"- Total blockers: {rerun_readiness['total_blockers']}",
        f"- Resolved blockers: {rerun_readiness['resolved_blockers']}",
        f"- Open blockers: {rerun_readiness['open_blockers']}",
        f"- Phase 78 rerun ready: {rerun_readiness['phase78_rerun_ready']}",
        "- Closure evidence is required for all blockers.",
        "",
        "STATUS=PASSED",
    ]
    (out_dir / "PHASE80_SUMMARY.md").write_text("\n".join(summary_lines) + "\n", encoding="utf-8")
    print("  wrote PHASE80_SUMMARY.md")

    print(
        f"Phase 80 complete. TotalBlockers={len(status_rows)}, "
        f"Open={open_blockers}, RerunReady={rerun_readiness['phase78_rerun_ready']}"
    )


if __name__ == "__main__":
    main()
