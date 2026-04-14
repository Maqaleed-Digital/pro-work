#!/usr/bin/env python3
import json
import os
import re
import sys
from pathlib import Path

repo = Path("/Users/waheebmahmoud/dev/pro-work")
evidence = Path(sys.argv[1])
cfg = repo / "config" / "analytics" / "runtime_discovery_targets.json"

targets = json.loads(cfg.read_text())
frontend_candidates = [repo / p for p in targets["frontend_candidates"] if (repo / p).exists()]
backend_candidates = [repo / p for p in targets["backend_candidates"] if (repo / p).exists()]

(evidence / "FRONTEND_TARGET_CANDIDATES.txt").write_text(
    "\n".join(str(p) for p in frontend_candidates) + ("\n" if frontend_candidates else "")
)
(evidence / "BACKEND_TARGET_CANDIDATES.txt").write_text(
    "\n".join(str(p) for p in backend_candidates) + ("\n" if backend_candidates else "")
)

status = "PASS"

if not os.environ.get("WORKCAPTAIN_BQ_PROJECT_ID") or not os.environ.get("WORKCAPTAIN_BQ_DATASET"):
    status = "BLOCKED_MISSING_ENV"
elif len(frontend_candidates) != 1 or len(backend_candidates) != 1:
    status = "BLOCKED_AMBIGUOUS_TARGETS"
else:
    frontend = frontend_candidates[0]
    backend = backend_candidates[0]

    frontend_text = frontend.read_text()
    backend_text = backend.read_text()

    frontend_import = "import { emitFrontendPageView } from '@/lib/analytics/frontendEmitter'\n"
    frontend_hook = "\nvoid emitFrontendPageView({ route: typeof window !== 'undefined' ? window.location.pathname : '/', sessionId: null, actorId: null })\n"
    backend_import = "import { emitPlatformLifecycleEvent } from '@/lib/analytics/platformEmitter'\n"
    backend_hook = "\nvoid emitPlatformLifecycleEvent({ eventName: 'PROJECT_CREATED', entityType: 'PROJECT', entityId: 'runtime-bootstrap', status: 'ACTIVE', correlationId: null })\n"

    if "emitFrontendPageView" not in frontend_text:
        if frontend.suffix in [".tsx", ".ts", ".jsx", ".js"]:
            if "import " in frontend_text:
                frontend_text = frontend_import + frontend_text
            else:
                status = "BLOCKED_PATCH_FAILURE"
        else:
            status = "BLOCKED_PATCH_FAILURE"

    if status == "PASS" and "emitPlatformLifecycleEvent" not in backend_text:
        if backend.suffix in [".tsx", ".ts", ".jsx", ".js"]:
            if "import " in backend_text:
                backend_text = backend_import + backend_text
            else:
                status = "BLOCKED_PATCH_FAILURE"
        else:
            status = "BLOCKED_PATCH_FAILURE"

    if status == "PASS":
        # Safe naive injection points: after first component/function block opening.
        if frontend_hook.strip() not in frontend_text:
            m = re.search(r"export default function [^{]+\{", frontend_text) or re.search(r"function [^{]+\{", frontend_text)
            if m:
                insert_at = m.end()
                frontend_text = frontend_text[:insert_at] + frontend_hook + frontend_text[insert_at:]
            else:
                status = "BLOCKED_PATCH_FAILURE"

        if status == "PASS" and backend_hook.strip() not in backend_text:
            m = re.search(r"export default function [^{]+\{", backend_text) or re.search(r"function [^{]+\{", backend_text) or re.search(r"async function [^{]+\{", backend_text)
            if m:
                insert_at = m.end()
                backend_text = backend_text[:insert_at] + backend_hook + backend_text[insert_at:]
            else:
                status = "BLOCKED_PATCH_FAILURE"

    if status == "PASS":
        tmp_front = frontend.with_suffix(frontend.suffix + ".tmp_phase98")
        tmp_back = backend.with_suffix(backend.suffix + ".tmp_phase98")
        tmp_front.write_text(frontend_text)
        tmp_back.write_text(backend_text)
        tmp_front.replace(frontend)
        tmp_back.replace(backend)
        (evidence / "FRONTEND_PATCHED_FILE.txt").write_text(str(frontend) + "\n")
        (evidence / "BACKEND_PATCHED_FILE.txt").write_text(str(backend) + "\n")

(evidence / "LIVE_WRITE_STATUS.txt").write_text(f"STATUS_CODE={status}\n")
print(f"STATUS_CODE={status}")
