// Wraps app/api/pdpl_router.js for the brief §6 Consent ledger surface.
//
// Backend reality:
//   POST /api/compliance/pdpl/dsr            — submit data-subject request
//   GET  /api/compliance/pdpl/dsr            — list DSRs for tenant
//   GET  /api/compliance/pdpl/dsr/:id        — get one
//   GET  /api/compliance/pdpl/dsr/sla-alerts — SLA alerts
//   GET  /api/compliance/pdpl/coverage       — policy coverage info
//   GET  /api/compliance/pdpl/lawful-basis   — lawful-basis matrix
//
// DSR types supported by backend: ACCESS, RECTIFICATION, ERASURE,
// PORTABILITY, OBJECTION, RESTRICTION (SLA 30 days; alerts at 25).
//
// What's MISSING (per Sponsor stricter rule today, labelled "Coming
// later" in the surface):
//   - "List consents granted" endpoint
//   - "Revoke individual consent" endpoint
//
// The Consent ledger reads current state from the onboarding profile
// (tenant.config.pdpl_consent stored Day 3) and uses DSR routes for
// any action the user wants taken (ERASURE for full revoke,
// RESTRICTION for partial revoke).

import { apiGet, apiPost } from "../api.js"
import { getOnboardingStatus } from "./onboarding.js"

const DSR_TYPES = ["ACCESS", "RECTIFICATION", "ERASURE", "PORTABILITY", "OBJECTION", "RESTRICTION"]

/**
 * Submit a Data-Subject Request.
 * @param {object} payload
 * @param {string} payload.type   — one of DSR_TYPES
 * @param {string} payload.description
 * @returns {Promise<object>}
 */
export async function submitDsr(payload) {
  if (!DSR_TYPES.includes(payload && payload.type)) {
    throw new Error(`Invalid DSR type. Allowed: ${DSR_TYPES.join(", ")}`)
  }
  return apiPost("/api/compliance/pdpl/dsr", payload)
}

/**
 * List the tenant's submitted DSRs.
 */
export async function listDsrs() {
  try {
    const data = await apiGet("/api/compliance/pdpl/dsr")
    return { dsrs: Array.isArray(data && data.dsrs) ? data.dsrs : (Array.isArray(data) ? data : []) }
  } catch (e) {
    if (e && (e.status === 404 || e.code === "NOT_FOUND")) return { dsrs: [] }
    throw e
  }
}

/**
 * Current consent snapshot — derived from onboarding profile because
 * no dedicated "list consents" endpoint exists today.
 */
export async function getCurrentConsents() {
  const status = await getOnboardingStatus()
  const c = (status && status.profile && status.profile.pdplConsent) || null
  if (!c) return { granted: false, items: [] }
  return {
    granted: !!c.granted,
    items: [
      {
        id: "onboarding-pdpl-v1",
        label: { en: "PDPL processing consent (onboarding)",
                 ar: "موافقة معالجة البيانات الشخصية (الإعداد)" },
        version: c.version || "v1",
        grantedAt: c.granted_at || c.grantedAt || null,
      },
    ],
  }
}

export { DSR_TYPES }
