#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/waheebmahmoud/dev/pro-work"
LIVE_BASE_URL="${WC_LIVE_BASE_URL:?WC_LIVE_BASE_URL is required}"
EVIDENCE_DIR="${WC_EVIDENCE_DIR:?WC_EVIDENCE_DIR is required}"

mkdir -p "${EVIDENCE_DIR}"

STATUS_FILE="${EVIDENCE_DIR}/EXECUTION_STATUS.txt"
ROUTE_FILE="${EVIDENCE_DIR}/ROUTE_CHECKS.tsv"
MARKER_FILE="${EVIDENCE_DIR}/MARKER_CHECKS.tsv"
DEMO_FILE="${EVIDENCE_DIR}/DEMO_NARRATIVE_LOCK.txt"
PRICING_FILE="${EVIDENCE_DIR}/PRICING_LOCK.txt"
SUMMARY_FILE="${EVIDENCE_DIR}/COMMERCIALIZATION_SUMMARY.md"

: > "${ROUTE_FILE}"
: > "${MARKER_FILE}"

echo -e "route\thttp_code\tresult" >> "${ROUTE_FILE}"
echo -e "page\tmarker\tresult" >> "${MARKER_FILE}"

ROUTES=(
  "/"
  "/control-tower"
  "/operations"
  "/verticals"
  "/onboarding"
  "/workforce"
  "/compliance"
  "/executive-intelligence"
  "/ar"
  "/ar/control-tower"
  "/ar/operations"
  "/ar/verticals"
  "/ar/onboarding"
  "/ar/workforce"
  "/ar/compliance"
  "/ar/executive-intelligence"
)

check_route() {
  local route="$1"
  local code
  code="$(curl -L -s -o /tmp/wc_route_body.txt -w "%{http_code}" "${LIVE_BASE_URL}${route}")"
  if [ "${code}" = "200" ]; then
    echo -e "${route}\t${code}\tPASS" >> "${ROUTE_FILE}"
  else
    echo -e "${route}\t${code}\tFAIL" >> "${ROUTE_FILE}"
    return 1
  fi
}

check_contains() {
  local page="$1"
  local marker="$2"
  local result="FAIL"
  if grep -Fq "${marker}" /tmp/wc_marker_body.txt; then
    result="PASS"
  fi
  echo -e "${page}\t${marker}\t${result}" >> "${MARKER_FILE}"
  [ "${result}" = "PASS" ]
}

FAIL=0

for route in "${ROUTES[@]}"; do
  if ! check_route "${route}"; then
    FAIL=1
  fi
done

# Marker checks fetch static HTML directly (iframe content, not the Next.js wrapper)
curl -L -s "${LIVE_BASE_URL}/prowork-wave1/workforce.html" > /tmp/wc_marker_body.txt
check_contains "/workforce" "42" || FAIL=1
check_contains "/workforce" "18" || FAIL=1
check_contains "/workforce" "9" || FAIL=1
check_contains "/workforce" "1.2M SAR" || FAIL=1
check_contains "/workforce" "78%" || FAIL=1

curl -L -s "${LIVE_BASE_URL}/prowork-wave1/compliance.html" > /tmp/wc_marker_body.txt
check_contains "/compliance" "Green" || FAIL=1
check_contains "/compliance" "92%" || FAIL=1
check_contains "/compliance" "2" || FAIL=1
check_contains "/compliance" "5" || FAIL=1

curl -L -s "${LIVE_BASE_URL}/prowork-wave1/executive.html" > /tmp/wc_marker_body.txt
check_contains "/executive-intelligence" "84%" || FAIL=1
check_contains "/executive-intelligence" "91%" || FAIL=1
check_contains "/executive-intelligence" "Low" || FAIL=1

curl -L -s "${LIVE_BASE_URL}/prowork-wave1/ar-workforce.html" > /tmp/wc_marker_body.txt
if grep -Eq 'dir="rtl"|rtl|القوى العاملة|الامتثال|التحليل التنفيذي' /tmp/wc_marker_body.txt; then
  echo -e "/ar/workforce\trtl_or_arabic_marker\tPASS" >> "${MARKER_FILE}"
else
  echo -e "/ar/workforce\trtl_or_arabic_marker\tFAIL" >> "${MARKER_FILE}"
  FAIL=1
fi

curl -L -s "${LIVE_BASE_URL}/prowork-wave1/ar-compliance.html" > /tmp/wc_marker_body.txt
if grep -Eq 'dir="rtl"|rtl|القوى العاملة|الامتثال|التحليل التنفيذي' /tmp/wc_marker_body.txt; then
  echo -e "/ar/compliance\trtl_or_arabic_marker\tPASS" >> "${MARKER_FILE}"
else
  echo -e "/ar/compliance\trtl_or_arabic_marker\tFAIL" >> "${MARKER_FILE}"
  FAIL=1
fi

curl -L -s "${LIVE_BASE_URL}/prowork-wave1/ar-executive.html" > /tmp/wc_marker_body.txt
if grep -Eq 'dir="rtl"|rtl|القوى العاملة|الامتثال|التحليل التنفيذي' /tmp/wc_marker_body.txt; then
  echo -e "/ar/executive-intelligence\trtl_or_arabic_marker\tPASS" >> "${MARKER_FILE}"
else
  echo -e "/ar/executive-intelligence\trtl_or_arabic_marker\tFAIL" >> "${MARKER_FILE}"
  FAIL=1
fi

cat > "${DEMO_FILE}" <<DEMOEOF
CANONICAL_DEMO_SEQUENCE=LOCKED
PRIMARY_ENGLISH=/>/control-tower>/workforce>/compliance>/executive-intelligence
PRIMARY_ARABIC=/ar>/ar/control-tower>/ar/workforce>/ar/compliance>/ar/executive-intelligence
MESSAGE=CONTROL_WORKFORCE_COMPLIANCE_AND_AI_EXECUTION
DEMOEOF

cat > "${PRICING_FILE}" <<PRICEEOF
PRICING_STRUCTURE=LOCKED
CORE_SETUP_SAR=12000
CORE_MONTHLY_SAR=3500
CONTROL_SETUP_SAR=25000
CONTROL_MONTHLY_SAR=9000
SOVEREIGN_SETUP_SAR=60000
SOVEREIGN_MONTHLY_SAR=20000
PILOT_CONTROL_SAR=18000
PILOT_SOVEREIGN_SAR=35000
PRICEEOF

CURRENT_HEAD="$(git rev-parse HEAD)"
BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD)"

cat > "${SUMMARY_FILE}" <<SUMEOF
# SDL COMMERCIALIZATION VERIFICATION SUMMARY

- LIVE_BASE_URL: ${LIVE_BASE_URL}
- BRANCH: ${BRANCH_NAME}
- HEAD: ${CURRENT_HEAD}
- ROUTE_FILE: ${ROUTE_FILE}
- MARKER_FILE: ${MARKER_FILE}
- DEMO_FILE: ${DEMO_FILE}
- PRICING_FILE: ${PRICING_FILE}

## Canonical commercial path
Landing -> Control Tower -> Workforce -> Compliance -> Executive Intelligence

## Core message
Work Captain is the sovereign workforce operating system for KSA-ready execution.
SUMEOF

if [ "${FAIL}" -eq 0 ]; then
  cat > "${STATUS_FILE}" <<EOFSTATUS
PHASE_SDL_COMMERCIALIZATION_PASS
LIVE_BASE_URL=${LIVE_BASE_URL}
BRANCH=${BRANCH_NAME}
HEAD=${CURRENT_HEAD}
ROUTES_PASS=1
MARKERS_PASS=1
DEMO_LOCK=1
PRICING_LOCK=1
EOFSTATUS
  echo "PASS: SDL commercialization verification complete"
else
  cat > "${STATUS_FILE}" <<EOFSTATUS
PHASE_SDL_COMMERCIALIZATION_FAIL
LIVE_BASE_URL=${LIVE_BASE_URL}
BRANCH=${BRANCH_NAME}
HEAD=${CURRENT_HEAD}
ROUTES_PASS=0
MARKERS_PASS=0
DEMO_LOCK=1
PRICING_LOCK=1
EOFSTATUS
  echo "FAIL: SDL commercialization verification failed"
  exit 1
fi
