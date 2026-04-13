#!/usr/bin/env bash
# WORKCAPTAIN — PHASE 89 VERIFICATION RUNNER
# Product Analytics + User Journey Instrumentation + Executive KPI Baseline
#
# Usage: ./scripts/workcaptain_phase89_product_analytics_kpi_baseline.sh <EVIDENCE_DIR>
#
# Fail-closed: exits non-zero on any verification failure

set -euo pipefail

EVIDENCE_DIR="${1:?EVIDENCE_DIR required as first argument}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FND_DIR="${REPO_ROOT}/FND"
ANALYTICS_CONFIG_DIR="${REPO_ROOT}/config/analytics"

mkdir -p "${EVIDENCE_DIR}"

PASS=0
FAIL=0
RESULTS=()

log()     { printf '%s %s\n' "[$(date -u +%H:%M:%SZ)]" "$*"; }
pass()    { PASS=$((PASS+1)); RESULTS+=("PASS: $1"); log "PASS: $1"; }
fail()    { FAIL=$((FAIL+1)); RESULTS+=("FAIL: $1"); log "FAIL: $1"; }

check_file() {
  local label="$1"
  local path="$2"
  if [ -f "${path}" ]; then
    pass "${label} exists"
  else
    fail "${label} missing: ${path}"
  fi
}

check_json_valid() {
  local label="$1"
  local path="$2"
  if python3 -c "import json,sys; json.load(open('${path}'))" 2>/dev/null; then
    pass "${label} valid JSON"
  else
    fail "${label} invalid JSON: ${path}"
  fi
}

check_json_min_count() {
  local label="$1"
  local path="$2"
  local jq_expr="$3"
  local min_count="$4"
  local count
  count="$(python3 -c "
import json, sys
data = json.load(open('${path}'))
parts = '${jq_expr}'.strip('.').split('.')
node = data
for p in parts:
    if p:
        node = node[p]
print(len(node))
" 2>/dev/null || echo 0)"
  if [ "${count}" -ge "${min_count}" ]; then
    pass "${label}: count=${count} >= min=${min_count}"
  else
    fail "${label}: count=${count} < min=${min_count}"
  fi
}

log "PHASE 89 VERIFICATION START"
log "EVIDENCE_DIR=${EVIDENCE_DIR}"
log "REPO_ROOT=${REPO_ROOT}"

# ── SECTION 1: FND documents ─────────────────────────────────────────────────
log "--- FND document checks ---"
check_file "FND/WORKCAPTAIN_PHASE_89_PRODUCT_ANALYTICS_AND_KPI_BASELINE.md" \
  "${FND_DIR}/WORKCAPTAIN_PHASE_89_PRODUCT_ANALYTICS_AND_KPI_BASELINE.md"
check_file "FND/WORKCAPTAIN_ANALYTICS_EVENT_SCHEMA.md" \
  "${FND_DIR}/WORKCAPTAIN_ANALYTICS_EVENT_SCHEMA.md"
check_file "FND/WORKCAPTAIN_GA4_TRACKING_PLAN.md" \
  "${FND_DIR}/WORKCAPTAIN_GA4_TRACKING_PLAN.md"
check_file "FND/WORKCAPTAIN_BIGQUERY_ANALYTICS_MODEL.md" \
  "${FND_DIR}/WORKCAPTAIN_BIGQUERY_ANALYTICS_MODEL.md"
check_file "FND/WORKCAPTAIN_EXECUTIVE_KPI_BASELINE.md" \
  "${FND_DIR}/WORKCAPTAIN_EXECUTIVE_KPI_BASELINE.md"

# ── SECTION 2: config/analytics JSON files ───────────────────────────────────
log "--- config/analytics file checks ---"
check_file "config/analytics/ga4.events.json" \
  "${ANALYTICS_CONFIG_DIR}/ga4.events.json"
check_file "config/analytics/platform.events.json" \
  "${ANALYTICS_CONFIG_DIR}/platform.events.json"
check_file "config/analytics/kpi_registry.json" \
  "${ANALYTICS_CONFIG_DIR}/kpi_registry.json"
check_file "config/analytics/bigquery_tables.json" \
  "${ANALYTICS_CONFIG_DIR}/bigquery_tables.json"

# ── SECTION 3: JSON validity ──────────────────────────────────────────────────
log "--- JSON validity checks ---"
check_json_valid "ga4.events.json" "${ANALYTICS_CONFIG_DIR}/ga4.events.json"
check_json_valid "platform.events.json" "${ANALYTICS_CONFIG_DIR}/platform.events.json"
check_json_valid "kpi_registry.json" "${ANALYTICS_CONFIG_DIR}/kpi_registry.json"
check_json_valid "bigquery_tables.json" "${ANALYTICS_CONFIG_DIR}/bigquery_tables.json"

# ── SECTION 4: Event registry counts ─────────────────────────────────────────
log "--- Event registry counts ---"
check_json_min_count "ga4.events.json: events >= 9" \
  "${ANALYTICS_CONFIG_DIR}/ga4.events.json" ".events" 9

# platform events: count across all families
PLATFORM_EVENT_COUNT="$(python3 -c "
import json
data = json.load(open('${ANALYTICS_CONFIG_DIR}/platform.events.json'))
total = sum(len(f['events']) for f in data['families'])
print(total)
" 2>/dev/null || echo 0)"
if [ "${PLATFORM_EVENT_COUNT}" -ge 13 ]; then
  pass "platform.events.json: total events=${PLATFORM_EVENT_COUNT} >= min=13"
else
  fail "platform.events.json: total events=${PLATFORM_EVENT_COUNT} < min=13"
fi

# ── SECTION 5: KPI registry completeness ─────────────────────────────────────
log "--- KPI registry checks ---"
check_json_min_count "kpi_registry.json: kpis >= 20" \
  "${ANALYTICS_CONFIG_DIR}/kpi_registry.json" ".kpis" 20

# Verify all 5 categories present
KPI_CATEGORIES="$(python3 -c "
import json
data = json.load(open('${ANALYTICS_CONFIG_DIR}/kpi_registry.json'))
cats = set(k['category'] for k in data['kpis'])
print(','.join(sorted(cats)))
" 2>/dev/null || echo '')"
REQUIRED_CATS="ai_trust,api,funnel,platform,user"
if [ "${KPI_CATEGORIES}" = "${REQUIRED_CATS}" ]; then
  pass "kpi_registry.json: all 5 categories present (${KPI_CATEGORIES})"
else
  fail "kpi_registry.json: categories mismatch — got '${KPI_CATEGORIES}', want '${REQUIRED_CATS}'"
fi

# ── SECTION 6: BigQuery table model ──────────────────────────────────────────
log "--- BigQuery table model checks ---"

BQ_DATASET_COUNT="$(python3 -c "
import json
data = json.load(open('${ANALYTICS_CONFIG_DIR}/bigquery_tables.json'))
print(len(data['datasets']))
" 2>/dev/null || echo 0)"
if [ "${BQ_DATASET_COUNT}" -ge 2 ]; then
  pass "bigquery_tables.json: datasets=${BQ_DATASET_COUNT} >= min=2"
else
  fail "bigquery_tables.json: datasets=${BQ_DATASET_COUNT} < min=2"
fi

BQ_TABLE_COUNT="$(python3 -c "
import json
data = json.load(open('${ANALYTICS_CONFIG_DIR}/bigquery_tables.json'))
total = sum(len(d['tables']) for d in data['datasets'])
print(total)
" 2>/dev/null || echo 0)"
if [ "${BQ_TABLE_COUNT}" -ge 7 ]; then
  pass "bigquery_tables.json: total tables=${BQ_TABLE_COUNT} >= min=7"
else
  fail "bigquery_tables.json: total tables=${BQ_TABLE_COUNT} < min=7"
fi

FUNNEL_STEP_COUNT="$(python3 -c "
import json
data = json.load(open('${ANALYTICS_CONFIG_DIR}/bigquery_tables.json'))
print(len(data['funnel_steps']))
" 2>/dev/null || echo 0)"
if [ "${FUNNEL_STEP_COUNT}" -ge 4 ]; then
  pass "bigquery_tables.json: funnel_steps=${FUNNEL_STEP_COUNT} >= min=4"
else
  fail "bigquery_tables.json: funnel_steps=${FUNNEL_STEP_COUNT} < min=4"
fi

# ── SECTION 7: Schema version governance ─────────────────────────────────────
log "--- Schema version governance ---"
for json_file in ga4.events.json platform.events.json kpi_registry.json bigquery_tables.json; do
  VERSION="$(python3 -c "
import json
data = json.load(open('${ANALYTICS_CONFIG_DIR}/${json_file}'))
print(data.get('schema_version', ''))
" 2>/dev/null || echo '')"
  if [ "${VERSION}" = "1.0" ]; then
    pass "${json_file}: schema_version=1.0"
  else
    fail "${json_file}: schema_version missing or not 1.0 (got '${VERSION}')"
  fi
done

# ── Results ──────────────────────────────────────────────────────────────────
log "--- Verification Results ---"
TOTAL=$((PASS + FAIL))
{
  printf 'PHASE_89_VERIFICATION\n'
  printf 'TOTAL=%d PASS=%d FAIL=%d\n' "${TOTAL}" "${PASS}" "${FAIL}"
  for r in "${RESULTS[@]}"; do
    printf '%s\n' "${r}"
  done
} | tee "${EVIDENCE_DIR}/PHASE_89_VERIFICATION.txt"

if [ "${FAIL}" -gt 0 ]; then
  log "FAIL: ${FAIL} checks failed"
  exit 1
else
  log "PHASE_89_VERIFICATION_PASS: ${PASS}/${TOTAL} checks passed"
  exit 0
fi
