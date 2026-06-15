// Wraps Nitaqat compliance endpoints for the brief §3.3 Saudisation
// module.
//
// Backend reality:
//   GET  /api/compliance/dashboard/nitaqat       — list nitaqat scores (JWT)
//   GET  /api/compliance/dashboard/nitaqat/:id   — get one (JWT)
//   POST /api/compliance/dashboard/nitaqat/compute  — compute new (JWT)
//   POST /api/admin/compliance/nitaqat/preview      — view-only impact (admin)
//
// The Saudisation Advisor (brief §3.3 agent recommendations) consumes
// the dashboard data + the existing AI router (app/api/ai_router.js)
// recommendations. Per Sponsor stricter rule today: advisor confidence
// defaults to Low/Moderate/High qualitative — numeric % only when the
// backend emits a `calibrated: true` flag.

import { apiGet, apiPost } from "../api.js"

/**
 * @typedef {object} NitaqatStatus
 * @property {string} zone               — 'platinum'|'high_green'|'medium_green'|'low_green'|'yellow'|'red'|'unknown'
 * @property {number|null} saudiPercent  — 0..1
 * @property {number|null} totalEmployees
 * @property {number|null} saudiEmployees
 * @property {string|null} lastUpdated
 * @property {object[]} [trend]
 */

/**
 * Fetch the current tenant's Nitaqat snapshot.
 * @returns {Promise<NitaqatStatus>}
 */
export async function getNitaqatStatus() {
  try {
    const data = await apiGet("/api/compliance/dashboard/nitaqat")
    return normaliseStatus(data)
  } catch (e) {
    if (e && (e.status === 404 || e.code === "NOT_FOUND")) {
      return emptyStatus()
    }
    throw e
  }
}

/**
 * Saudisation Advisor recommendations.
 * Returns up to N most recent advisory outputs with attribution metadata.
 *
 * This consumes the existing AI audit log (S36-G2) filtered to
 * Nitaqat/Saudisation action_type. Each output carries:
 *   - agent identity (action_type → agent name mapping)
 *   - confidence (calibrated bool + score)
 *   - reasoning (rationale field)
 *   - source data points (input_signals field)
 *
 * @param {number} [limit=5]
 * @returns {Promise<{recommendations: Array}>}
 */
export async function listAdvisorRecommendations(limit = 5) {
  try {
    const data = await apiGet(`/api/admin/ai/audit-log?reviewerDecision=PENDING&limit=${encodeURIComponent(limit)}`)
    const items = Array.isArray(data && data.items) ? data.items : []
    // Filter to Saudisation-related entries; mapping is action_type prefix.
    const filtered = items.filter(it => {
      const t = String(it.action_type || it.actionType || "").toLowerCase()
      return t.includes("saudi") || t.includes("nitaqat") || t.includes("hiring")
    })
    return { recommendations: filtered.map(normaliseRecommendation) }
  } catch (e) {
    // Returning empty rather than throwing keeps the advisor surface
    // showing an honest empty state rather than tearing down the page.
    return { recommendations: [] }
  }
}

function emptyStatus() {
  return {
    zone: "unknown",
    saudiPercent: null,
    totalEmployees: null,
    saudiEmployees: null,
    lastUpdated: null,
    trend: null,
  }
}

function normaliseStatus(data) {
  if (!data || typeof data !== "object") return emptyStatus()
  // Different shapes: { zone, saudi_percent, ... } or wrapped in { latest: {...} }
  const s = data.latest || data
  const z = String(s.zone || s.nitaqatZone || "unknown").toLowerCase()
  const allowedZones = new Set(["platinum","high_green","medium_green","low_green","green","yellow","red","unknown"])
  const zone = allowedZones.has(z) ? z : "unknown"
  const saudi = s.saudiPercent ?? s.saudi_percent ?? null
  const saudiNormalised = typeof saudi === "number"
    ? (saudi > 1 ? saudi / 100 : saudi)
    : null
  return {
    zone,
    saudiPercent: saudiNormalised,
    totalEmployees: typeof s.totalEmployees === "number" ? s.totalEmployees : (typeof s.total_employees === "number" ? s.total_employees : null),
    saudiEmployees: typeof s.saudiEmployees === "number" ? s.saudiEmployees : (typeof s.saudi_employees === "number" ? s.saudi_employees : null),
    lastUpdated: typeof s.lastUpdated === "string" ? s.lastUpdated : (typeof s.last_updated === "string" ? s.last_updated : null),
    trend: Array.isArray(data.trend || s.trend) ? (data.trend || s.trend) : null,
  }
}

function normaliseRecommendation(r) {
  if (!r || typeof r !== "object") return null
  const conf = typeof r.confidence_score === "number" ? r.confidence_score : null
  const calibrated = r.confidence_calibrated === true
  const band = conf == null ? "unknown"
    : conf >= 0.8 ? "high"
    : conf >= 0.5 ? "moderate"
    : "low"
  return {
    id: r.id,
    actionType: r.action_type || r.actionType || "",
    agent: {
      name: agentNameFromActionType(r.action_type || r.actionType),
      class: "platform-scoped",
      version: r.model_version || r.modelVersion || "v1",
      hitlStatus: (r.reviewer_decision || r.reviewerDecision) === "PENDING" ? "pending" : null,
    },
    confidence: { band, value: conf, calibrated },
    rationale: r.rationale || "",
    inputSignals: Array.isArray(r.input_signals) ? r.input_signals : [],
    createdAt: r.created_at || r.createdAt || null,
    correlationId: r.correlation_id || r.correlationId || r.id || null,
  }
}

function agentNameFromActionType(t) {
  const k = String(t || "").toLowerCase()
  if (k.includes("saudi") || k.includes("nitaqat")) return "WorkCaptain Saudisation Advisor"
  if (k.includes("hiring") || k.includes("role")) return "WorkCaptain Hiring Advisor"
  return "WorkCaptain Advisor"
}
