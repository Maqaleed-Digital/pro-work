"use strict"

/**
 * S32: WOS Scheduler Engine
 * Tenant-scoped queues, configurable interval (default 30s), pause/resume per tenant.
 * State persisted to app/data/scheduler.json.
 *
 * Usage:
 *   const scheduler = require("./scheduler")
 *   scheduler.init({ getActiveTenants, runForTenant })
 *   scheduler.start(30000)
 */

const fs   = require("fs")
const path = require("path")
const { getAppDataDir } = require("../lib/data_paths")

const STATE_PATH        = path.join(getAppDataDir(), "scheduler.json")
const DEFAULT_INTERVAL  = 30000  // 30 s

function nowIso() { return new Date().toISOString() }

function saveState(s) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true })
    fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2) + "\n", "utf8")
  } catch (e) { console.error("[scheduler] persist failed:", e && e.message) }
}

// ── in-memory state ──────────────────────────────────────────────────────────
const _state = {
  enabled:     false,
  interval_ms: DEFAULT_INTERVAL,
  started_at:  null,
  stopped_at:  null,
  last_run:    null,
  last_error:  null,
  // { [tenantId]: { paused, paused_at, resumed_at, last_run, last_error } }
  tenants: {}
}

let _timer   = null
let _running = false

// injected by server
let _getActiveTenants = () => []
let _runForTenant     = (_tid) => {}

// ── helpers ──────────────────────────────────────────────────────────────────
function _ensureTenant(tid) {
  if (!_state.tenants[tid]) {
    _state.tenants[tid] = { paused: false, paused_at: null, resumed_at: null, last_run: null, last_error: null }
  }
}

function _persist() {
  saveState({
    enabled:     _state.enabled,
    interval_ms: _state.interval_ms,
    started_at:  _state.started_at,
    stopped_at:  _state.stopped_at,
    last_run:    _state.last_run,
    last_error:  _state.last_error,
    tenants:     _state.tenants
  })
}

function _tick() {
  if (_running) return
  _running = true
  const started_at = nowIso()
  let processed = 0
  try {
    const allTenants = _getActiveTenants()
    for (const tid of allTenants) {
      _ensureTenant(tid)
      if (_state.tenants[tid].paused) continue
      try {
        _runForTenant(tid)
        _state.tenants[tid].last_run   = nowIso()
        _state.tenants[tid].last_error = null
        processed++
      } catch (e) {
        _state.tenants[tid].last_error = { message: e && e.message ? String(e.message) : "tick failed" }
      }
    }
    _state.last_run   = { started_at, finished_at: nowIso(), tenants_processed: processed }
    _state.last_error = null
  } catch (e) {
    _state.last_error = { message: e && e.message ? String(e.message) : "scheduler tick error" }
  } finally {
    _running = false
    _persist()
  }
}

// ── public API ────────────────────────────────────────────────────────────────
const scheduler = {

  /**
   * Inject deps + load persisted state.
   * Must be called once at server startup before start().
   */
  init({ getActiveTenants, runForTenant } = {}) {
    if (typeof getActiveTenants === "function") _getActiveTenants = getActiveTenants
    if (typeof runForTenant     === "function") _runForTenant     = runForTenant

    try {
      const saved = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"))
      if (Number.isFinite(Number(saved.interval_ms)) && Number(saved.interval_ms) >= 1000)
        _state.interval_ms = Number(saved.interval_ms)
      if (saved.last_run)   _state.last_run   = saved.last_run
      if (saved.last_error) _state.last_error = saved.last_error
      if (saved.tenants && typeof saved.tenants === "object" && !Array.isArray(saved.tenants))
        _state.tenants = saved.tenants
    } catch { /* no persisted state — start fresh */ }

    console.log(`[scheduler] init: interval=${_state.interval_ms}ms, ${Object.keys(_state.tenants).length} tenant(s) tracked`)
  },

  /** Start the interval loop. interval_ms defaults to last-used or 30s. */
  start(intervalMs) {
    const ms = Number.isFinite(Number(intervalMs)) && Number(intervalMs) >= 1000
      ? Number(intervalMs) : _state.interval_ms
    if (_timer) clearInterval(_timer)
    _state.enabled     = true
    _state.interval_ms = ms
    _state.started_at  = nowIso()
    _state.stopped_at  = null
    _timer = setInterval(_tick, ms)
    _persist()
    return scheduler.snapshot()
  },

  /** Stop the interval loop. */
  stop() {
    if (_timer) { clearInterval(_timer); _timer = null }
    _state.enabled    = false
    _state.stopped_at = nowIso()
    _persist()
    return scheduler.snapshot()
  },

  /** Pause scheduling for a specific tenant. */
  pause(tenantId) {
    _ensureTenant(tenantId)
    _state.tenants[tenantId].paused      = true
    _state.tenants[tenantId].paused_at   = nowIso()
    _state.tenants[tenantId].resumed_at  = null
    _persist()
    return { tenant_id: tenantId, ..._state.tenants[tenantId] }
  },

  /** Resume scheduling for a specific tenant. */
  resume(tenantId) {
    _ensureTenant(tenantId)
    _state.tenants[tenantId].paused     = false
    _state.tenants[tenantId].resumed_at = nowIso()
    _persist()
    return { tenant_id: tenantId, ..._state.tenants[tenantId] }
  },

  /** Ensure a newly registered tenant appears in the queue. */
  trackTenant(tenantId) {
    _ensureTenant(tenantId)
  },

  /** Returns scheduler state snapshot. tenants is an array sorted by tenant_id. */
  snapshot() {
    return {
      enabled:     _state.enabled,
      interval_ms: _state.interval_ms,
      running:     _running,
      started_at:  _state.started_at,
      stopped_at:  _state.stopped_at,
      last_run:    _state.last_run,
      last_error:  _state.last_error,
      tenants: Object.entries(_state.tenants)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tid, s]) => ({
          tenant_id:   tid,
          paused:      Boolean(s.paused),
          paused_at:   s.paused_at   || null,
          resumed_at:  s.resumed_at  || null,
          last_run:    s.last_run    || null,
          last_error:  s.last_error  || null
        }))
    }
  }
}

module.exports = scheduler
