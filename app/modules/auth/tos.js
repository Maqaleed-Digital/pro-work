'use strict'

/**
 * WC-02: Terms of Service acceptance gate.
 *
 * TOS_VERSION is a placeholder version string (mechanism-only; no legal text here).
 * recordTosAcceptance appends an immutable row to tos_acceptances.
 */
const TOS_VERSION = process.env.TOS_VERSION || '2026-06-16.v1'

async function recordTosAcceptance(pool, { userId, tenantId, source }) {
  await pool.query(
    `INSERT INTO tos_acceptances (user_id, tenant_id, tos_version, acceptance_source)
     VALUES ($1, $2, $3, $4)`,
    [userId, tenantId || null, TOS_VERSION, source]
  )
}

module.exports = { TOS_VERSION, recordTosAcceptance }
