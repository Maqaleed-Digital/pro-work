// Wraps compliance endpoints for the brief §3.5 Compliance module.
//
// Backend reality:
//   GET /api/compliance/dashboard/summary   — aggregated tenant snapshot
//   GET /api/compliance/dashboard/nitaqat   — Nitaqat scores
//   GET /api/compliance/risk/*              — risk surface (S37-G6)
//   GET /api/compliance/pdpl/*              — DSR + PDPL (S38-G6/S39-G6)
//
// Filing calendar (GOSI / Qiwa / Mudad deadlines) does NOT have a
// dedicated endpoint today. Per PROPOSAL §11.A4 the Day-5 module derives
// upcoming filings from compliance summary fields where available, and
// renders empty-state / "Coming later" badge where data is missing.

import { apiGet } from "../api.js"

/**
 * @typedef {object} ComplianceSummary
 * @property {string} status           — 'green'|'amber'|'red'|'unknown'
 * @property {object[]} filings        — upcoming filing deadlines
 * @property {object[]} events         — recent compliance events
 * @property {object|null} score
 */

/**
 * Fetch the aggregated compliance snapshot.
 * @returns {Promise<ComplianceSummary>}
 */
export async function getComplianceSummary() {
  try {
    const data = await apiGet("/api/compliance/dashboard/summary")
    return normalise(data)
  } catch (e) {
    if (e && (e.status === 404 || e.code === "NOT_FOUND")) return emptySummary()
    throw e
  }
}

function emptySummary() {
  return { status: "unknown", filings: [], events: [], score: null }
}

function normalise(data) {
  if (!data || typeof data !== "object") return emptySummary()
  return {
    status: ["green","amber","red"].includes(String(data.status || "").toLowerCase())
      ? String(data.status).toLowerCase() : "unknown",
    filings: Array.isArray(data.filings) ? data.filings.map(normaliseFiling) : deriveSyntheticFilings(data),
    events: Array.isArray(data.events) ? data.events : [],
    score: data.score || null,
  }
}

function normaliseFiling(f) {
  if (!f || typeof f !== "object") return null
  return {
    id: f.id || f.filing_id || null,
    authority: String(f.authority || f.regulator || "").toLowerCase(),   // gosi | qiwa | mudad | zatca | unknown
    title: f.title || f.label || "",
    dueAt: f.dueAt || f.due_at || null,
    status: ["pending","filed","overdue"].includes(String(f.status || "").toLowerCase())
      ? String(f.status).toLowerCase() : "pending",
  }
}

/**
 * Derive synthetic upcoming filing reminders from the compliance
 * summary when the backend doesn't emit a structured calendar.
 * Stricter rule: this is NOT a phantom feature — every item is clearly
 * a "scheduled reminder" with no underlying live data, and the empty
 * state explains the data gap.
 */
function deriveSyntheticFilings(data) {
  if (!data) return []
  const out = []
  // GOSI monthly contributions (last day of month) — informational stub.
  // We surface these as reminders only when the tenant has employees.
  const hasEmployees = (data.headcount || data.totalEmployees) > 0
  if (!hasEmployees) return []
  const now = new Date()
  const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  out.push({
    id: "stub-gosi-monthly",
    authority: "gosi",
    title: "GOSI monthly contributions",
    dueAt: eom.toISOString(),
    status: "pending",
    synthetic: true,
  })
  // Qiwa monthly compliance — same cadence (informational reminder).
  out.push({
    id: "stub-qiwa-monthly",
    authority: "qiwa",
    title: "Qiwa monthly compliance check",
    dueAt: eom.toISOString(),
    status: "pending",
    synthetic: true,
  })
  return out
}
