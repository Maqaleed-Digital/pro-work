#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/Users/waheebmahmoud/dev/pro-work}"
RUN_TS="${RUN_TS:-$(date -u +%Y%m%dT%H%M%SZ)}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$REPO_ROOT/evidence/s28_$RUN_TS}"

mkdir -p "$EVIDENCE_DIR"

cat > "$EVIDENCE_DIR/EXECUTION_STATUS.txt" <<STATUS
SPRINT=S28
STATUS=IN_PROGRESS
COMMAND_CENTER=REQUIRED
AI_CONTROL=REQUIRED
COMPLIANCE_SURFACE=REQUIRED
EVIDENCE_SURFACE=REQUIRED
FINANCIAL_SURFACE=REQUIRED
PDPL_SURFACE=REQUIRED
GOVERNANCE_CLOSURE=REQUIRED
STATUS

cat > "$EVIDENCE_DIR/ROUTE_SURFACE_MATRIX.md" <<'ROUTES'
# ROUTE SURFACE MATRIX

| Route | Status | Notes |
|---|---|---|
| / | PENDING | Command Center |
| /workforce | PENDING | Workforce visibility |
| /execution | PENDING | Execution visibility |
| /ai | PENDING | Explainability surface |
| /compliance | PENDING | Sovereign visibility |
| /evidence | PENDING | Evidence visibility |
| /payments | PENDING | Financial visibility |
| /identity | PENDING | Identity visibility |
| /admin | PENDING | Control visibility |
ROUTES

cat > "$EVIDENCE_DIR/AI_EXPLAINABILITY_MATRIX.md" <<'AI'
# AI EXPLAINABILITY MATRIX

- Recommendation list visible: PENDING
- Rationale visible: PENDING
- Confidence visible: PENDING
- Reviewer action visible: PENDING
- Override capture visible: PENDING
- Audit reference visible: PENDING
AI

cat > "$EVIDENCE_DIR/COMPLIANCE_SURFACE_MATRIX.md" <<'COMP'
# COMPLIANCE SURFACE MATRIX

- WPS readiness visible: PENDING
- Probation visibility: PENDING
- Compliance alerts visible: PENDING
- Consent / PDPL visibility: PENDING
- Sovereign widgets visible: PENDING
COMP

cat > "$EVIDENCE_DIR/EVIDENCE_SURFACE_MATRIX.md" <<'EVD'
# EVIDENCE SURFACE MATRIX

- Evidence index visible: PENDING
- Evidence detail visible: PENDING
- Audit timeline visible: PENDING
- Export entry visible: PENDING
- AI artifacts visible: PENDING
- Approval chain visible: PENDING
EVD

cat > "$EVIDENCE_DIR/FINANCIAL_SURFACE_MATRIX.md" <<'FIN'
# FINANCIAL SURFACE MATRIX

- Escrow state visible: PENDING
- Payout state visible: PENDING
- Fee disclosure visible: PENDING
- Release status visible: PENDING
- Hold / dispute state visible: PENDING
FIN

cat > "$EVIDENCE_DIR/PDPL_SURFACE_MATRIX.md" <<'PDPL'
# PDPL SURFACE MATRIX

- Consent state visible: PENDING
- Export entry visible: PENDING
- Redaction controls visible: PENDING
- DSR workflow entry visible: PENDING
- Privacy operational surface visible: PENDING
PDPL

cat > "$EVIDENCE_DIR/GOVERNANCE_CLOSURE.md" <<'GOV'
# GOVERNANCE CLOSURE

To close S28, replace PENDING with PASS / FAIL and append:
- pushed commit hash
- reviewer name
- date/time UTC
- unresolved issues if any
GOV

echo "S28 controller initialized evidence directory:"
echo "$EVIDENCE_DIR"
