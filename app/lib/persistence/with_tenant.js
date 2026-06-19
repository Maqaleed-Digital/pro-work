// WorkCaptain — consolidated tenant-context helper (WO-WC-SEC-01).
//
// Replaces the 12 per-module `withTenant`/`setTenant` variants that set the tenant GUC
// SESSION-scoped (set_config(..., false)) on a pooled client and released it WITHOUT closing the
// transaction — so the GUC survived release() and the next checkout inherited the prior tenant's
// context (fails OPEN on a recycled connection; the SP-03/DL-108 defect class).
//
// This helper sets the GUC TRANSACTION-LOCAL (set_config(..., true)) inside ONE BEGIN/COMMIT on the
// pooled client; the GUC auto-clears at COMMIT/ROLLBACK, so the connection returns GUC-clean and a
// missed-setTenant path fails CLOSED (NULL GUC → no rows) instead of leaking the prior tenant.
//
// TWO GUCs, by design (both load-bearing — confirmed in the schema):
//   * app.current_tenant_id  (text  'tn-…')  — keys the operational tenant tables (contracts, offers,
//                                               candidates, requisitions, applications, esb, probation,
//                                               offboarding, sdp_programs, wps, users, sessions, …).
//   * app.tenant_id          (UUID)          — keys the append-only/audit tables owned by prowork_owner
//                                               (evidence_*, recommendation_audit_logs, sdp_programmes,
//                                               sdp_enrolments). UUID = md5(tenant string), deterministic.
// Setting BOTH on every checkout means any table is correctly scoped regardless of which GUC its
// policy keys on — no caller has to know the table's GUC dialect.
//
// NOTE (WO-WC-SEC-01 finding): this helper makes the GUC correct, but RLS is only ENFORCED on tables
// where the app role is a NON-owner OR the table is FORCE ROW LEVEL SECURITY. The prowork_app-owned
// operational tables are currently ENABLE-not-FORCE → owner-bypassed → this helper's GUC is necessary
// but NOT SUFFICIENT until FORCE RLS (or a non-owner app role) lands. See the GO-1 review notes.

const crypto = require("crypto")

// Deterministic UUID from a 'tn-…' tenant string (mirrors the existing toUuid/MD5 derivation used
// at ai_matching_service.js:156, application_service.js:47, requisition_router.js:214).
function tenantUuid(tenantId) {
  const h = crypto.createHash("md5").update(tenantId || "system").digest("hex")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

// Set both tenant GUCs TRANSACTION-LOCAL on an already-connected client. Caller MUST be inside an
// explicit transaction (is_local=true only persists within a txn). Use this when the caller owns the
// transaction (e.g. auth register, which writes tenant + user + ToS in one txn on its own client).
async function setTenantContext(client, tenantId) {
  await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId])
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantUuid(tenantId)])
}

// Run fn on a pooled client whose tenant GUCs are set, inside ONE transaction. The txn-local GUCs
// auto-clear at COMMIT/ROLLBACK so the client returns to the pool GUC-clean.
async function withTenant(pool, tenantId, fn) {
  if (!pool) throw new Error("pool is required")
  if (!tenantId) throw Object.assign(new Error("tenantId is required"), { status: 400 })
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await setTenantContext(client, tenantId)
    const result = await fn(client)
    await client.query("COMMIT")
    return result
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

module.exports = { withTenant, setTenantContext, tenantUuid }
