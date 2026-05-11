// Wraps app/api/identity_eri_router.js + lifecycle/onboarding endpoints
// for the Day-5 brief §3.2 Employees module.
//
// Backend reality (per server.js wiring inspection):
//   GET /api/identity/workers              — list workers
//   GET /api/identity/:workerId/profile    — worker profile
//   GET /api/identity/:workerId/eri        — worker ERI score
//   GET /api/identity/:workerId/employer-summary
//
// NO Add/Edit/Delete endpoints exist for `worker` in the customer-facing
// path today. The lifecycle_router handles employee lifecycle events
// (probation, ESB, offboarding) but is not an "add employee" surface.
//
// Per PROPOSAL §11.A4 + Sponsor stricter rule, the Day-5 employees page
// labels Add/Edit/CSV-import as "Coming later" with disabled controls
// rather than rendering phantom buttons. List + view are functional.

import { apiGet } from "../api.js"

/**
 * @typedef {object} Worker
 * @property {string} worker_id
 * @property {string} display_name
 * @property {object} [profile]    — populated on view-detail
 * @property {object} [eri]        — populated on view-detail
 */

/**
 * List all workers for the authenticated tenant.
 * @returns {Promise<{workers: Worker[]}>}
 */
export async function listWorkers() {
  try {
    const data = await apiGet("/api/identity/workers")
    const items = Array.isArray(data) ? data : (Array.isArray(data && data.workers) ? data.workers : [])
    return { workers: items.map(normaliseWorker) }
  } catch (e) {
    if (e && (e.status === 404 || e.code === "NOT_FOUND")) {
      return { workers: [] }
    }
    throw e
  }
}

/**
 * Get a worker's full detail bundle (profile + ERI + employer-summary).
 * Each call is independent — partial failures are surfaced as null fields.
 * @param {string} workerId
 */
export async function getWorker(workerId) {
  const [profile, eri, summary] = await Promise.allSettled([
    apiGet(`/api/identity/${encodeURIComponent(workerId)}/profile`),
    apiGet(`/api/identity/${encodeURIComponent(workerId)}/eri`),
    apiGet(`/api/identity/${encodeURIComponent(workerId)}/employer-summary`),
  ])
  return {
    workerId,
    profile: profile.status === "fulfilled" ? profile.value : null,
    eri:     eri.status === "fulfilled"     ? eri.value     : null,
    summary: summary.status === "fulfilled" ? summary.value : null,
  }
}

function normaliseWorker(w) {
  if (!w || typeof w !== "object") return { worker_id: "", display_name: "" }
  return {
    worker_id: w.worker_id || w.id || "",
    display_name: w.display_name || w.name || w.worker_id || "",
    role: w.role || null,
    department: w.department || null,
    nationality: w.nationality || null,
    status: w.status || null,
  }
}
