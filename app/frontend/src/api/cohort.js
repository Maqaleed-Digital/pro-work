// Wraps app/api/cohort_router.js (WC-CB Day 3 backend).
//
// Routes:
//   POST /api/cohort/request                       — PUBLIC (no auth)
//   GET  /api/cohort/requests                      — auth, MANAGE_PRINCIPALS
//   POST /api/cohort/requests/:id/mark-reviewed    — auth, MANAGE_PRINCIPALS

import { apiGet, apiPost, apiPostPublic } from "../api.js"

/**
 * Submit a cohort access request (public — no auth).
 * Validation is performed both client-side (in pages/request_access.js)
 * and server-side (cohort_router.js validate()).
 *
 * @param {object} payload
 * @returns {Promise<{requestId: string, message: string, messageAr: string}>}
 */
export async function submitCohortRequest(payload) {
  return apiPostPublic("/api/cohort/request", payload)
}

/**
 * List all cohort requests for sponsor review.
 * Requires MANAGE_PRINCIPALS permission on the calling user.
 *
 * @returns {Promise<{requests: object[], count: number}>}
 */
export async function listCohortRequests() {
  const data = await apiGet("/api/cohort/requests")
  return {
    requests: Array.isArray(data && data.requests) ? data.requests : [],
    count: typeof data?.count === "number" ? data.count : 0,
  }
}

/**
 * Mark a cohort request as reviewed (sponsor downstream issues invitation
 * via /api/invitations endpoint).
 *
 * @param {string} id
 * @returns {Promise<{id: string, status: string, reviewedAt: string}>}
 */
export async function markCohortRequestReviewed(id) {
  return apiPost(`/api/cohort/requests/${encodeURIComponent(id)}/mark-reviewed`, {})
}
