#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/Users/waheebmahmoud/dev/pro-work}"
RUN_TS="${RUN_TS:-$(date -u +%Y%m%dT%H%M%SZ)}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$REPO_ROOT/evidence/s30_$RUN_TS}"

mkdir -p "$EVIDENCE_DIR"

cat > "$EVIDENCE_DIR/EXECUTION_STATUS.txt" <<STATUS
SPRINT=S30
STATUS=IN_PROGRESS
REVENUE_SURFACE=REQUIRED
EMPLOYER_ONBOARDING=REQUIRED
WORKER_ONBOARDING=REQUIRED
PSP_PATH=REQUIRED
COMMERCIAL_API=REQUIRED
EXPLAINABILITY=REQUIRED
GOVERNANCE_CLOSURE=REQUIRED
STATUS

cat > "$EVIDENCE_DIR/REVENUE_SURFACE_MATRIX.md" <<'REV'
# REVENUE SURFACE MATRIX
- pricing/package visibility exists: PENDING
- fee disclosure visible: PENDING
- commercial readiness strip visible: PENDING
- payout/escrow state visible: PENDING
- conversion CTA visible: PENDING
REV

cat > "$EVIDENCE_DIR/EMPLOYER_ONBOARDING_MATRIX.md" <<'EMP'
# EMPLOYER ONBOARDING MATRIX
- employer onboarding path exists: PENDING
- company/profile setup visible: PENDING
- compliance prompts visible: PENDING
- payment path prompts visible: PENDING
- activation state visible: PENDING
EMP

cat > "$EVIDENCE_DIR/WORKER_ONBOARDING_MATRIX.md" <<'WRK'
# WORKER ONBOARDING MATRIX
- worker onboarding path exists: PENDING
- identity readiness visible: PENDING
- payout readiness visible: PENDING
- compliance readiness visible: PENDING
- onboarding state visible: PENDING
WRK

cat > "$EVIDENCE_DIR/PSP_PATH_MATRIX.md" <<'PSP'
# PSP PATH MATRIX
- PSP matrix exists: PENDING
- staged vs live state visible: PENDING
- payout support visible: PENDING
- escrow support visible: PENDING
- next action visible: PENDING
PSP

cat > "$EVIDENCE_DIR/COMMERCIAL_API_MATRIX.md" <<'API'
# COMMERCIAL API MATRIX
- pricing/config structure exists: PENDING
- onboarding/config structure exists: PENDING
- PSP readiness/config exists: PENDING
- tenant-safe behavior preserved: PENDING
- role-aware access preserved: PENDING
API

cat > "$EVIDENCE_DIR/EXPLAINABILITY_MATRIX.md" <<'EXPL'
# EXPLAINABILITY MATRIX
- staged vs live commercial state clear: PENDING
- fee path explained: PENDING
- onboarding state explained: PENDING
- PSP next-step guidance visible: PENDING
EXPL

cat > "$EVIDENCE_DIR/GOVERNANCE_CLOSURE.md" <<'GOV'
# GOVERNANCE CLOSURE
To close S30, replace PENDING with PASS / FAIL and append:
- pushed commit hash
- reviewer name
- date/time UTC
- unresolved issues if any
GOV

echo "S30 controller initialized evidence directory:"
echo "$EVIDENCE_DIR"
