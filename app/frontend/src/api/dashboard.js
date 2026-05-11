// Wraps backend dashboard KPI endpoint.
// Source: app/api/dashboard_router.js (admin /api/admin/dashboard/kpi)
//         + app/server.js compliance dashboard wiring (/api/compliance/dashboard/*)
//
// For the customer-facing /app/ dashboard (Day 4 brief §3.1) we prefer
// the JWT-authed compliance dashboard endpoints; the admin-bearer one is
// retained as fallback for operator-mode usage.
//
// Stricter rule: every field is destructured defensively. A partial or
// 4xx backend response degrades to empty-state on the card, never crash.

import { apiGet } from "../api.js"

/**
 * @typedef {object} KpiSummary
 * @property {number|null} saudiPercent       — 0..1 ratio
 * @property {number|null} employeeCount
 * @property {number|null} pendingFilings
 * @property {'green'|'amber'|'red'|'unknown'} complianceStatus
 * @property {object[]}    [trend]             — 7-day series, optional
 * @property {string|null} [lastUpdated]       — ISO 8601
 */

/**
 * Fetch the dashboard KPI snapshot for the authenticated tenant.
 * @returns {Promise<KpiSummary>}
 */
export async function getDashboardSummary() {
  // Try the cohort-side endpoint first (JWT-authed; tenant-scoped).
  // Falls back to admin endpoint if 404 (e.g., a tenant running on the
  // older S39 surface only). Either response is normalised to a single
  // shape so the UI doesn't have to switch.
  try {
    const data = await apiGet("/api/compliance/dashboard/summary")
    return normaliseFromCohortSummary(data)
  } catch (e) {
    if (e && (e.status === 404 || e.code === "NOT_FOUND")) {
      try {
        const data = await apiGet("/api/admin/dashboard/kpi")
        return normaliseFromAdminKpi(data)
      } catch {
        return emptySummary()
      }
    }
    // 401/403 etc. bubble up to the caller for permission-denied state.
    throw e
  }
}

function emptySummary() {
  return {
    saudiPercent:     null,
    employeeCount:    null,
    pendingFilings:   null,
    complianceStatus: "unknown",
    trend:            null,
    lastUpdated:      null,
  }
}

function normaliseFromCohortSummary(data) {
  if (!data || typeof data !== "object") return emptySummary()
  const saudi = data.saudiPercent ?? data.saudisationRate ?? data.saudisation?.rate ?? null
  const count = data.employeeCount ?? data.headcount ?? data.totalEmployees ?? null
  const pending = data.pendingFilings ?? data.filingsPending ?? null
  const status = String(data.complianceStatus || data.status || "unknown").toLowerCase()
  return {
    saudiPercent:     typeof saudi === "number" ? saudi : null,
    employeeCount:    typeof count === "number" ? count : null,
    pendingFilings:   typeof pending === "number" ? pending : null,
    complianceStatus: ["green", "amber", "red"].includes(status) ? status : "unknown",
    trend:            Array.isArray(data.trend) ? data.trend : null,
    lastUpdated:      typeof data.lastUpdated === "string" ? data.lastUpdated : null,
  }
}

function normaliseFromAdminKpi(data) {
  // Admin endpoint shape per app/api/dashboard_router.js: { kpis, entities, ... }
  if (!data || typeof data !== "object") return emptySummary()
  const k = data.kpis || {}
  const saudi = k.saudiPercent ?? k.saudisation_rate ?? null
  // Admin endpoint sometimes returns percentage as 0..100; normalise to 0..1.
  const saudiNormalised = typeof saudi === "number"
    ? (saudi > 1 ? saudi / 100 : saudi)
    : null
  return {
    saudiPercent:     saudiNormalised,
    employeeCount:    typeof k.employeeCount === "number" ? k.employeeCount : (typeof k.headcount === "number" ? k.headcount : null),
    pendingFilings:   typeof k.pendingFilings === "number" ? k.pendingFilings : null,
    complianceStatus: ["green", "amber", "red"].includes(String(k.complianceStatus || "").toLowerCase()) ? String(k.complianceStatus).toLowerCase() : "unknown",
    trend:            Array.isArray(data.trend) ? data.trend : null,
    lastUpdated:      typeof data.lastUpdated === "string" ? data.lastUpdated : null,
  }
}
