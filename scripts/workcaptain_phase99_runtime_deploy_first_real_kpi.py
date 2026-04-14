#!/usr/bin/env python3
import json
import os
import re
import subprocess
import sys
from pathlib import Path

repo = Path("/Users/waheebmahmoud/dev/pro-work")
evidence = Path(sys.argv[1])
cfg = json.loads((repo / "config" / "analytics" / "deploy_discovery_targets.json").read_text())
candidates = [repo / p for p in cfg["deploy_candidates"] if (repo / p).exists()]
(evidence / "DEPLOY_TARGET_CANDIDATES.txt").write_text("\n".join(str(p) for p in candidates) + ("\n" if candidates else ""))

status = "PASS"

if len(candidates) != 1:
    status = "BLOCKED_AMBIGUOUS_DEPLOY_TARGET"
else:
    target = candidates[0]
    envs = cfg["required_env"]
    text = target.read_text()

    if target.name == ".env":
        for k, v in envs.items():
            if re.search(rf"^{re.escape(k)}=", text, flags=re.M):
                text = re.sub(rf"^{re.escape(k)}=.*$", f"{k}={v}", text, flags=re.M)
            else:
                if not text.endswith("\n"):
                    text += "\n"
                text += f"{k}={v}\n"
    else:
        # only patch shell scripts that already use gcloud deploy style env-vars flag
        if "--set-env-vars" in text:
            wanted = ",".join(f"{k}={v}" for k, v in envs.items())
            if "WORKCAPTAIN_BQ_PROJECT_ID" in text or "WORKCAPTAIN_BQ_DATASET" in text:
                text = re.sub(
                    r"--set-env-vars[ =][^\n\\]+",
                    f"--set-env-vars {wanted}",
                    text,
                    count=1
                )
            else:
                text = text.replace("--set-env-vars", f"--set-env-vars {wanted},", 1)
        else:
            status = "BLOCKED_AMBIGUOUS_DEPLOY_TARGET"

    if status == "PASS":
        tmp = target.with_suffix(target.suffix + ".tmp_phase99")
        tmp.write_text(text)
        tmp.replace(target)
        (evidence / "PATCHED_DEPLOY_FILE.txt").write_text(str(target) + "\n")

        # deploy execution
        deploy_cmd = ""
        if target.suffix == ".sh":
            deploy_cmd = f'bash "{target}"'
        else:
            deploy_cmd = f'cat "{target}"'
        (evidence / "DEPLOY_COMMAND.txt").write_text(deploy_cmd + "\n")

        rc = subprocess.call(deploy_cmd, shell=True, cwd=str(repo))
        if rc != 0:
            status = "BLOCKED_DEPLOY_FAILURE"

        if status == "PASS":
            # frontend trigger
            front_rc = subprocess.call(
                'curl -fsS "https://workcaptain.ai" > "{}" 2> "{}"'.format(
                    evidence / "FRONTEND_TRIGGER_RESULT.txt",
                    evidence / "FRONTEND_TRIGGER_RESULT.err"
                ),
                shell=True
            )
            if front_rc != 0:
                status = "BLOCKED_TRIGGER_FAILURE"

        if status == "PASS":
            backend_candidates = json.loads((repo / "config" / "analytics" / "live_trigger_targets.json").read_text())["backend_trigger_candidates"]
            backend_ok = False
            for url in backend_candidates:
                rc = subprocess.call(
                    f'curl -fsS "{url}" > "{evidence / "BACKEND_TRIGGER_RESULT.txt"}" 2> "{evidence / "BACKEND_TRIGGER_RESULT.err"}"',
                    shell=True
                )
                if rc == 0:
                    backend_ok = True
                    break
            if not backend_ok:
                status = "BLOCKED_TRIGGER_FAILURE"

        if status == "PASS":
            rerun_dir = evidence / "phase97_rerun"
            rerun_dir.mkdir(parents=True, exist_ok=True)
            rc = subprocess.call(
                f'WORKCAPTAIN_BQ_PROJECT_ID=prj-maq-workcaptain-nonprod WORKCAPTAIN_BQ_DATASET=workcaptain_analytics bash "/Users/waheebmahmoud/dev/pro-work/scripts/workcaptain_phase97_runtime_event_emission_first_output.sh" "{rerun_dir}"',
                shell=True,
                cwd=str(repo)
            )
            if rc != 0:
                status = "BLOCKED_PHASE97_FAILURE"
            else:
                live = (rerun_dir / "LIVE_READOUT_STATUS.txt").read_text()
                (evidence / "PHASE97_RERUN_RESULT.txt").write_text(live)
                if "STATUS_CODE=PASS" not in live:
                    status = "BLOCKED_PHASE97_FAILURE"

(evidence / "LIVE_DEPLOY_STATUS.txt").write_text(f"STATUS_CODE={status}\n")
print(f"STATUS_CODE={status}")
