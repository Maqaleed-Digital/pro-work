// Wraps app/api/invitation_router.js
//
// Routes:
//   POST   /api/invitations        — create invitation (auth, OWNER/ADMIN)
//   GET    /api/invitations        — list invitations
//   DELETE /api/invitations/:id    — revoke invitation
//   POST   /api/invitations/accept — public (token + password) — handled
//                                     by pages/accept_invite.js directly

import { apiGet, apiPost } from "../api.js"

/**
 * @typedef {object} Invitation
 * @property {string} id
 * @property {string} email
 * @property {string} role
 * @property {string} createdAt
 * @property {string|null} acceptedAt
 * @property {string|null} revokedAt
 */

/**
 * List invitations for the authenticated tenant.
 * @returns {Promise<{invitations: Invitation[]}>}
 */
export async function listInvitations() {
  const data = await apiGet("/api/invitations")
  return { invitations: Array.isArray(data && data.invitations) ? data.invitations : [] }
}

/**
 * Create a new invitation for a team member.
 * @param {string} email
 * @param {string} role     — e.g., 'ADMIN' | 'MANAGER' | 'VIEWER'
 * @returns {Promise<{id: string, link: string}>}
 */
export async function createInvitation(email, role) {
  return apiPost("/api/invitations", { email, role })
}

/**
 * Revoke a pending invitation.
 * @param {string} id
 * @returns {Promise<{message: string}>}
 */
export async function revokeInvitation(id) {
  // apiPost is POST; we need DELETE. Use fetch directly with auth headers.
  const { getToken, getTenant } = await import("../api.js")
  const headers = {
    "content-type": "application/json",
    "cache-control": "no-store",
    "X-Tenant-Id": getTenant(),
  }
  const tok = getToken()
  if (tok) headers["Authorization"] = "Bearer " + tok
  const resp = await fetch(`/api/invitations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers,
  })
  const text = await resp.text()
  const json = text ? JSON.parse(text) : null
  if (!json || json.ok !== true) {
    const ec = (json && json.error) || {}
    const e = new Error(`${ec.code || "ERR"}: ${ec.message || "revoke failed"}`)
    e.code = ec.code; e.status = resp.status
    throw e
  }
  return json.data
}
