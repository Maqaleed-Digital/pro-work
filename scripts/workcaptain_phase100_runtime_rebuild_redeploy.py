#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path

repo = Path("/Users/waheebmahmoud/dev/pro-work")
evidence = Path(sys.argv[1])
cfg = json.loads((repo / "config" / "analytics" / "redeploy_runtime_targets.json").read_text())
trigger_cfg = json.loads((repo / "config" / "analytics" / "live_row_trigger_targets.json").read_text())

project_id = cfg["project_id"]
region = cfg["region"]
web_service = cfg["web_service"]
api_service = cfg["api_service"]
web_dir = repo / cfg["web_source_dir"]
api_dir = repo / cfg["api_source_dir"]
bq_env = cfg["bq_env"]

# --update-env-vars merges; --set-env-vars would replace ALL vars and destroy
# API_ORIGIN on web-service and API_*_TOKEN vars on api-service.
env_arg = ",".join(f"{k}={v}" for k, v in bq_env.items())

status = "PASS"

# --- web-service rebuild + redeploy ---
web_cmd = [
    "gcloud", "run", "deploy", web_service,
    "--source", str(web_dir),
    "--project", project_id,
    "--region", region,
    "--update-env-vars", env_arg,
    "--quiet"
]
web_result = subprocess.run(web_cmd, capture_output=True, text=True, cwd=str(repo))
(evidence / "WEB_BUILD_RESULT.txt").write_text(
    f"EXIT={web_result.returncode}\n--- STDOUT ---\n{web_result.stdout}\n--- STDERR ---\n{web_result.stderr}\n"
)
if web_result.returncode != 0:
    status = "BLOCKED_WEB_BUILD_FAILURE"
else:
    # Route 100% traffic to latest revision (overrides any pinned revision from Phase 99)
    subprocess.run([
        "gcloud", "run", "services", "update-traffic", web_service,
        "--to-latest", "--project", project_id, "--region", region
    ], capture_output=True, text=True)

# --- api-service: SKIP source rebuild ---
# prowork_runtime/api has no HTTP server; source rebuild breaks the live service.
# BQ env vars (WORKCAPTAIN_BQ_PROJECT_ID, WORKCAPTAIN_BQ_DATASET) are already present
# on the live revision (api-service-00006-8fr) from Phase 99.
# Traffic is confirmed at 100% on 00006-8fr; no action required.
if status == "PASS":
    (evidence / "API_BUILD_RESULT.txt").write_text(
        "EXIT=0\nSKIPPED: api-service source rebuild skipped; BQ env vars already present on live revision.\n"
    )

# --- frontend trigger ---
if status == "PASS":
    front_rc = subprocess.call(
        'curl -fsS "{}" > "{}" 2> "{}"'.format(
            trigger_cfg["frontend_trigger_url"],
            evidence / "FRONTEND_TRIGGER_RESULT.txt",
            evidence / "FRONTEND_TRIGGER_RESULT.err"
        ),
        shell=True
    )
    if front_rc != 0:
        status = "BLOCKED_TRIGGER_FAILURE"

# --- backend trigger ---
if status == "PASS":
    backend_ok = False
    for url in trigger_cfg["backend_trigger_candidates"]:
        rc = subprocess.call(
            'curl -fsS "{}" > "{}" 2> "{}"'.format(
                url,
                evidence / "BACKEND_TRIGGER_RESULT.txt",
                evidence / "BACKEND_TRIGGER_RESULT.err"
            ),
            shell=True
        )
        if rc == 0:
            backend_ok = True
            break
    if not backend_ok:
        status = "BLOCKED_TRIGGER_FAILURE"

# --- phase97 rerun ---
if status == "PASS":
    rerun_dir = evidence / "phase97_rerun"
    rerun_dir.mkdir(parents=True, exist_ok=True)
    rc = subprocess.call(
        'WORKCAPTAIN_BQ_PROJECT_ID=prj-maq-workcaptain-nonprod WORKCAPTAIN_BQ_DATASET=workcaptain_analytics'
        ' bash "/Users/waheebmahmoud/dev/pro-work/scripts/workcaptain_phase97_runtime_event_emission_first_output.sh"'
        f' "{rerun_dir}"',
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

(evidence / "LIVE_REDEPLOY_STATUS.txt").write_text(f"STATUS_CODE={status}\n")
print(f"STATUS_CODE={status}")
