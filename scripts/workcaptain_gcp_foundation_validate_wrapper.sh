#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="/opt/prowork"
cd "$REPO_ROOT"

# WC_GCP_VALIDATION_MODE: local | dev (default: dev)
MODE="${WC_GCP_VALIDATION_MODE:-dev}"
export WC_GCP_VALIDATION_MODE="$MODE"

if [ "$MODE" = "dev" ]; then
  : "${WC_GCP_PROJECT_ID:?Set WC_GCP_PROJECT_ID for dev mode}"
  export WC_GCP_PROJECT_ID
fi

: "${WC_GCP_REGION:=me-central2}"
: "${WC_GCP_ENV:=dev}"
: "${WC_GCP_DB_TIER:=db-custom-1-3840}"

export WC_GCP_REGION
export WC_GCP_ENV
export WC_GCP_DB_TIER

"$REPO_ROOT/scripts/workcaptain_gcp_foundation_validate.sh"
