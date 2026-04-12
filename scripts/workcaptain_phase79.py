#!/usr/bin/env python3
"""
Phase 79 — Blocker Closure + Certification Upgrade Readiness
Reads Phase 78 certification_upgrade_gaps.json, produces blocker closure tracking artifacts.
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
    if len(sys.argv) != 3:
        print("usage: workcaptain_phase79.py <prior_evidence_dir> <output_evidence_dir>", file=sys.stderr)
        sys.exit(1)

    prior = Path(sys.argv[1]).resolve()
    out = Path(sys.argv[2]).resolve()

    gaps_path = prior / "certification_upgrade_gaps.json"
    if not gaps_path.is_file():
        print(f"FAIL_CLOSED: certification_upgrade_gaps.json missing: {gaps_path}", file=sys.stderr)
        sys.exit(1)

    gaps = load_json(gaps_path)
    blockers = gaps["blockers"]

    closure_register = []
    validation = []
    open_blockers = 0

    for b in blockers:
        closure_register.append({
            "gap_id": b["gap_id"],
            "status": "OPEN",
            "closure_required": b["reason"],
            "closure_evidence": None,
        })
        validation.append({
            "gap_id": b["gap_id"],
            "validated": False,
            "reason": "No new evidence provided in Phase 79",
        })
        open_blockers += 1

    readiness = {
        "total_blockers": len(blockers),
        "open_blockers": open_blockers,
        "ready_for_upgrade": open_blockers == 0,
        "next_action": "Execute Phase 78 again only after all blockers are closed",
    }

    out.mkdir(parents=True, exist_ok=True)
    write_json(out / "blocker_closure_register.json", {"closure_register": closure_register})
    write_json(out / "blocker_closure_validation.json", {"validation": validation})
    write_json(out / "certification_readiness_state.json", readiness)

    summary_lines = [
        "# PHASE 79 SUMMARY",
        "",
        f"- Total blockers: {len(blockers)}",
        f"- Open blockers: {open_blockers}",
        f"- Ready for upgrade: {readiness['ready_for_upgrade']}",
        f"- Next action: {readiness['next_action']}",
        "",
        "STATUS=PASSED",
    ]
    (out / "PHASE79_SUMMARY.md").write_text("\n".join(summary_lines) + "\n", encoding="utf-8")
    print("  wrote PHASE79_SUMMARY.md")

    print(f"Phase 79 complete. OpenBlockers={open_blockers}, ReadyForUpgrade={readiness['ready_for_upgrade']}")


if __name__ == "__main__":
    main()
