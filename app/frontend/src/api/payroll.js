// Wraps app/api/wps_readiness_router.js for the brief §3.4 Payroll module.
//
// Backend reality (read-only flow for the controlled-beta window):
//   POST /api/onboarding/wps/validate-iban   — IBAN format check
//   POST /api/onboarding/wps/pack            — generate WPS readiness pack
//   GET  /api/onboarding/wps/:pack_id        — fetch readiness pack
//   GET  /api/onboarding/wps/:pack_id/ep     — fetch EP wrapper
//
// Per brief §3.4: "Payroll runs list, view detail (read-only acceptable
// for v1 if backend write endpoints not yet exposed). Payment status
// (informational; payment processing is backend / partner-mediated)."
//
// No "payroll runs" list endpoint exists today — backend exposes packs.
// We surface the most recent pack as the payroll status snapshot and
// label "Payroll runs" as Coming later per PROPOSAL §11.A4.

import { apiGet } from "../api.js"

/**
 * Fetch a WPS readiness pack by id.
 * @param {string} packId
 */
export async function getWpsPack(packId) {
  return apiGet(`/api/onboarding/wps/${encodeURIComponent(packId)}`)
}

/**
 * Best-effort payroll snapshot for the dashboard / payroll module.
 * Returns null when no pack ID is known to the client.
 *
 * The customer-facing page reads the latest WPS pack id from localStorage
 * (set during onboarding). If unavailable, the page renders empty-state.
 */
export async function getLatestWpsPack() {
  let packId = null
  try { packId = localStorage.getItem("pw_wps_pack_id") } catch {}
  if (!packId) return null
  try {
    return await getWpsPack(packId)
  } catch {
    return null
  }
}
