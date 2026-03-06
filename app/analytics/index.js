"use strict"

/**
 * S33: WOS Analytics Engine
 * Computes workforce utilization, assignment density, and evidence activity
 * per tenant from live in-memory store data.
 *
 * Usage:
 *   const Analytics = require("./analytics")
 *   const metrics = Analytics.computeTenantMetrics(tenantId, tenantStore)
 *   Analytics.appendSnapshot([metrics])
 *   const history = Analytics.loadSnapshots()
 */

const fs   = require("fs")
const path = require("path")
const { getAppDataDir } = require("../lib/data_paths")

const SNAPSHOTS_PATH = path.join(getAppDataDir(), "analytics_snapshots.json")
const MAX_SNAPSHOTS  = 100   // rolling window — oldest entries trimmed first

// ── metric computation ────────────────────────────────────────────────────────

/**
 * Compute live workforce metrics for a single tenant.
 * @param {string} tenantId
 * @param {{ wosWorkers: Map, wosPods: Map, wosAssignments: Map, wosEvidenceEvents: Array }} tenantStore
 * @returns {object} metrics snapshot
 */
function computeTenantMetrics(tenantId, tenantStore) {
  const computedAt = new Date().toISOString()

  // workers
  const workers     = Array.from((tenantStore.wosWorkers || new Map()).values())
  const active      = workers.filter(w => String(w.status || "") === "active")
  const inactive    = workers.filter(w => String(w.status || "") === "inactive")
  const suspended   = workers.filter(w => String(w.status || "") === "suspended")
  const assigned    = active.filter(w => w.assigned_pod != null)
  const fteCount    = workers.filter(w => String(w.type   || "") === "FTE").length
  const freCount    = workers.filter(w => String(w.type   || "") === "FREELANCER").length

  // pods
  const pods       = Array.from((tenantStore.wosPods || new Map()).values())
  const activePods = pods.filter(p => String(p.state || "") === "active")

  // assignments
  const assignments       = Array.from((tenantStore.wosAssignments || new Map()).values())
  const activeAssignments = assignments.filter(a => String(a.state || "") === "active")

  // evidence
  const events   = Array.isArray(tenantStore.wosEvidenceEvents) ? tenantStore.wosEvidenceEvents : []
  const lastEvent = events.length > 0 ? events[events.length - 1] : null
  const lastEventAt = lastEvent
    ? (lastEvent.timestamp || lastEvent.at || lastEvent.ts || null)
    : null

  // group events by action
  const eventsByAction = {}
  for (const ev of events) {
    const key = String(ev.action || "unknown")
    eventsByAction[key] = (eventsByAction[key] || 0) + 1
  }

  const utilRate = active.length > 0
    ? Math.round((assigned.length / active.length) * 1000) / 1000
    : 0
  const density = activePods.length > 0
    ? Math.round((activeAssignments.length / activePods.length) * 1000) / 1000
    : 0

  return {
    tenant_id:   tenantId,
    computed_at: computedAt,
    workforce: {
      total_workers:     workers.length,
      active_workers:    active.length,
      inactive_workers:  inactive.length,
      suspended_workers: suspended.length,
      fte_count:         fteCount,
      freelancer_count:  freCount,
      assigned_count:    assigned.length,
      unassigned_count:  active.length - assigned.length,
      utilization_rate:  utilRate         // 0–1 fraction of active workers assigned
    },
    pods: {
      total_pods:  pods.length,
      active_pods: activePods.length
    },
    assignments: {
      total_assignments:  assignments.length,
      active_assignments: activeAssignments.length,
      assignment_density: density          // active assignments per active pod
    },
    evidence: {
      total_events:     events.length,
      last_event_at:    lastEventAt,
      events_by_action: eventsByAction
    }
  }
}

/**
 * Aggregate cross-tenant summary from an array of per-tenant metrics.
 * @param {object[]} metricsList
 * @returns {object} aggregate
 */
function aggregateMetrics(metricsList) {
  let totalWorkers = 0, activeWorkers = 0, assignedWorkers = 0
  let totalPods = 0, activePods = 0
  let totalAssignments = 0, activeAssignments = 0
  let totalEvents = 0

  for (const m of metricsList) {
    totalWorkers     += m.workforce.total_workers
    activeWorkers    += m.workforce.active_workers
    assignedWorkers  += m.workforce.assigned_count
    totalPods        += m.pods.total_pods
    activePods       += m.pods.active_pods
    totalAssignments += m.assignments.total_assignments
    activeAssignments += m.assignments.active_assignments
    totalEvents      += m.evidence.total_events
  }

  return {
    computed_at:        new Date().toISOString(),
    tenant_count:       metricsList.length,
    total_workers:      totalWorkers,
    active_workers:     activeWorkers,
    assigned_workers:   assignedWorkers,
    utilization_rate:   activeWorkers > 0
      ? Math.round((assignedWorkers / activeWorkers) * 1000) / 1000 : 0,
    total_pods:         totalPods,
    active_pods:        activePods,
    total_assignments:  totalAssignments,
    active_assignments: activeAssignments,
    assignment_density: activePods > 0
      ? Math.round((activeAssignments / activePods) * 1000) / 1000 : 0,
    total_evidence_events: totalEvents
  }
}

// ── snapshot persistence ──────────────────────────────────────────────────────

function loadSnapshots() {
  try {
    const raw = JSON.parse(fs.readFileSync(SNAPSHOTS_PATH, "utf8"))
    return Array.isArray(raw.snapshots) ? raw.snapshots : []
  } catch { return [] }
}

function saveSnapshots(snapshots) {
  try {
    fs.mkdirSync(path.dirname(SNAPSHOTS_PATH), { recursive: true })
    fs.writeFileSync(
      SNAPSHOTS_PATH,
      JSON.stringify({ snapshots }, null, 2) + "\n",
      "utf8"
    )
  } catch (e) { console.error("[analytics] save failed:", e && e.message) }
}

/**
 * Append a new snapshot entry and persist.  Trims to MAX_SNAPSHOTS.
 * @param {object[]} metricsPerTenant  array of computeTenantMetrics() results
 * @returns {object[]} current snapshot list (after trim)
 */
function appendSnapshot(metricsPerTenant) {
  const snapshots = loadSnapshots()
  snapshots.push({
    snapshotted_at: new Date().toISOString(),
    aggregate:      aggregateMetrics(metricsPerTenant),
    tenants:        metricsPerTenant
  })
  const trimmed = snapshots.slice(-MAX_SNAPSHOTS)
  saveSnapshots(trimmed)
  return trimmed
}

module.exports = {
  computeTenantMetrics,
  aggregateMetrics,
  loadSnapshots,
  saveSnapshots,
  appendSnapshot
}
