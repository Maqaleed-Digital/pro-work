#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/Users/waheebmahmoud/dev/pro-work}"
RUN_TS="${RUN_TS:-$(date -u +%Y%m%dT%H%M%SZ)}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$REPO_ROOT/evidence/s29_$RUN_TS}"

mkdir -p "$EVIDENCE_DIR"

cat > "$EVIDENCE_DIR/EXECUTION_STATUS.txt" <<STATUS
SPRINT=S29
STATUS=IN_PROGRESS
TOKEN_MODEL=REQUIRED
TOKEN_ISSUANCE=REQUIRED
IDENTITY_GRAPH=REQUIRED
IDENTITY_API=REQUIRED
IDENTITY_UI=REQUIRED
EXPLAINABILITY=REQUIRED
GOVERNANCE_CLOSURE=REQUIRED
STATUS

cat > "$EVIDENCE_DIR/TOKEN_MODEL_MATRIX.md" <<'TOKMODEL'
# TOKEN MODEL MATRIX
- token schema exists: PENDING
- token persistence exists: PENDING
- token states defined: PENDING
- token source references defined: PENDING
TOKMODEL

cat > "$EVIDENCE_DIR/TOKEN_ISSUANCE_MATRIX.md" <<'TOKISSUE'
# TOKEN ISSUANCE MATRIX
- project completion issuance: PENDING
- phr approval issuance: PENDING
- compliance verification issuance: PENDING
- leadership issuance path: PENDING
- idempotent issuance behavior: PENDING
TOKISSUE

cat > "$EVIDENCE_DIR/IDENTITY_GRAPH_MATRIX.md" <<'GRAPH'
# IDENTITY GRAPH MATRIX
- relationship model exists: PENDING
- worked_with relation exists: PENDING
- completed_project relation exists: PENDING
- explainable source linkage exists: PENDING
- tenant-safe filtering exists: PENDING
GRAPH

cat > "$EVIDENCE_DIR/IDENTITY_API_MATRIX.md" <<'API'
# IDENTITY API MATRIX
- summary endpoint exists: PENDING
- tokens endpoint exists: PENDING
- token detail endpoint exists: PENDING
- graph endpoint exists: PENDING
- worker identity endpoint exists: PENDING
API

cat > "$EVIDENCE_DIR/IDENTITY_UI_MATRIX.md" <<'UI'
# IDENTITY UI MATRIX
- identity summary visible: PENDING
- worker identity table visible: PENDING
- token explorer visible: PENDING
- graph/relationship panel visible: PENDING
- API readiness card visible: PENDING
UI

cat > "$EVIDENCE_DIR/EXPLAINABILITY_MATRIX.md" <<'EXPL'
# EXPLAINABILITY MATRIX
- token source reference visible: PENDING
- graph relation source visible: PENDING
- audit-safe fields only: PENDING
- role-aware access preserved: PENDING
EXPL

cat > "$EVIDENCE_DIR/GOVERNANCE_CLOSURE.md" <<'GOV'
# GOVERNANCE CLOSURE
To close S29, replace PENDING with PASS / FAIL and append:
- pushed commit hash
- reviewer name
- date/time UTC
- unresolved issues if any
GOV

echo "S29 controller initialized evidence directory:"
echo "$EVIDENCE_DIR"
