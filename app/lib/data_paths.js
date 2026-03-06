"use strict"

/**
 * S35: Runtime data directory abstraction.
 * In development: uses repo-relative paths (existing behaviour).
 * In production:  both functions return process.env.PROWORK_DATA_DIR.
 *
 * __dirname here is app/lib/, so:
 *   _DEV_WOS = app/lib/../../data  → repo root data/   (per-tenant WOS files)
 *   _DEV_APP = app/lib/../data     → app/data/          (registry, scheduler, analytics)
 */

const path = require("path")

const _DEV_WOS = path.join(__dirname, "..", "..", "data")  // repo root data/
const _DEV_APP = path.join(__dirname, "..", "data")        // app/data/

/** WOS tenant data root — contains tenants/<tid>/{workers,pods,...}.json */
function getDataDir() {
  return process.env.PROWORK_DATA_DIR || _DEV_WOS
}

/** App-level runtime state — contains tenants.json, scheduler.json, analytics_snapshots.json */
function getAppDataDir() {
  return process.env.PROWORK_DATA_DIR || _DEV_APP
}

module.exports = { getDataDir, getAppDataDir }
