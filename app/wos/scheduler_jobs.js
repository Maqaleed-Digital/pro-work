"use strict"

/**
 * S34: WOS Scheduler Jobs
 * Self-contained scheduling logic injected into the Scheduler engine.
 * Accepts (tenantId, tenantStore) — no server.js globals needed.
 *
 * Usage:
 *   const SchedulerJobs = require("./wos/scheduler_jobs")
 *   Scheduler.init({
 *     getActiveTenants: ...,
 *     runForTenant: (tid) => SchedulerJobs.runForTenant(tid, getTenantStore(tid))
 *   })
 */

const crypto = require("crypto")

function nowIso() { return new Date().toISOString() }

// ── eligibility helpers ───────────────────────────────────────────────────────

function _activeAssignmentCount(tenantStore, podId) {
  let count = 0
  for (const asn of tenantStore.wosAssignments.values()) {
    if (!asn) continue
    if (String(asn.pod_id   || "") !== String(podId || "")) continue
    if (String(asn.state    || "") === "active") count++
  }
  return count
}

function _eligiblePods(tenantStore) {
  const pods = Array.from(tenantStore.wosPods.values())
    .filter(p => String(p.state || "") === "active")
  pods.sort((a, b) => {
    const ca = String(a.created_at || "")
    const cb = String(b.created_at || "")
    if (ca !== cb) return ca < cb ? -1 : 1
    return String(a.id || "").localeCompare(String(b.id || ""))
  })
  return pods
}

function _eligibleWorkers(tenantStore) {
  const workers = Array.from(tenantStore.wosWorkers.values())
    .filter(w => w && String(w.status || "") === "active" &&
                 (w.assigned_pod === null || w.assigned_pod === undefined))
  workers.sort((a, b) => {
    const ca = String(a.created_at || "")
    const cb = String(b.created_at || "")
    if (ca !== cb) return ca < cb ? -1 : 1
    return String(a.id || "").localeCompare(String(b.id || ""))
  })
  return workers
}

// ── plan builder ──────────────────────────────────────────────────────────────

function buildPlan(tenantStore, limit) {
  const cap     = Number.isInteger(limit) && limit > 0 ? limit : 50
  const pods    = _eligiblePods(tenantStore)
  const workers = _eligibleWorkers(tenantStore)

  const planned = []
  for (const pod of pods) {
    if (planned.length >= cap) break
    const maxW = pod.capacity && Number.isFinite(Number(pod.capacity.max_workers))
      ? Number(pod.capacity.max_workers) : 1
    const roles = Array.isArray(pod.roles) && pod.roles.length > 0
      ? pod.roles : ["member"]
    const taken = _activeAssignmentCount(tenantStore, pod.id)
    const slots = maxW - taken
    for (let i = 0; i < slots && workers.length > 0 && planned.length < cap; i++) {
      const w = workers.shift()
      planned.push({ worker_id: w.id, pod_id: pod.id, role: roles[0] || "member" })
    }
  }

  return {
    planned,
    stats: {
      eligible_pods:      pods.length,
      unassigned_workers: workers.length + planned.length,
      planned_count:      planned.length
    }
  }
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Execute one scheduling pass for a tenant. Mutates tenantStore in-place.
 * Returns { assigned, planned } — caller handles persistence if assigned > 0.
 * @param {string} tenantId
 * @param {{ wosWorkers: Map, wosPods: Map, wosAssignments: Map, wosEvidenceEvents: Array }} tenantStore
 * @param {{ limit?: number }} [opts]
 */
function runForTenant(tenantId, tenantStore, opts = {}) {
  const plan    = buildPlan(tenantStore, opts.limit || 50)
  const planned = plan.planned
  const ts      = nowIso()

  for (const slot of planned) {
    const worker = tenantStore.wosWorkers.get(slot.worker_id) || null
    const pod    = tenantStore.wosPods.get(slot.pod_id)       || null
    if (!worker || !pod) continue
    if (worker.assigned_pod !== null && worker.assigned_pod !== undefined) continue

    const asnId = crypto.randomUUID()
    const asn   = {
      id:         asnId,
      worker_id:  worker.id,
      pod_id:     pod.id,
      role:       slot.role || "member",
      state:      "active",
      created_at: ts,
      updated_at: ts
    }

    tenantStore.wosAssignments.set(asnId, asn)
    tenantStore.wosWorkers.set(worker.id, {
      ...worker,
      assigned_pod: { pod_id: pod.id, role: asn.role, assignment_id: asnId }
    })
    tenantStore.wosEvidenceEvents.push({
      id:          crypto.randomUUID(),
      tenant_id:   tenantId,
      timestamp:   ts,
      action:      "wos.scheduler.assign",
      entity_type: "wos.assignment",
      entity_id:   asnId,
      snapshot:    { assignment: asn }
    })
  }

  return { assigned: planned.length, plan }
}

module.exports = { runForTenant, buildPlan }
