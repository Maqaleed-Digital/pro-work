"use strict";

/**
 * Admin permissions (single source).
 * Keep strings stable: referenced by server handlers and conformance suite.
 *
 * PROWORK PHASE 11 — Permission-Bound Operational Control Layer
 *
 * Live roles:
 *   superadmin — sovereign; all permissions (wildcard)
 *   ops        — operational admin; read + execute + retry; no override
 *   auditor    — read-only; no mutations
 *
 * Semantic permission class → native permission string mapping:
 *   system.read    → ops:system:read
 *   identity.read  → ops:identity:read
 *   admin.read     → admin:governance:read   (existing)
 *   ops.read       → ops:status:read
 *   ops.execute    → ops:execute
 *   ops.retry      → ops:retry
 *   ops.override   → ops:override            (superadmin only)
 */

// ---------------------------------------------------------------------------
// Permission catalog — all native permission strings (stable identifiers)
// ---------------------------------------------------------------------------
const PERMS = Object.freeze({
  // Phase 10 — admin resource permissions (preserved)
  ADMIN_STATS_READ:            "admin:stats:read",
  ADMIN_GOVERNANCE_READ:       "admin:governance:read",
  ADMIN_WORKERS_READ:          "admin:workers:read",
  ADMIN_WORKERS_WRITE:         "admin:workers:write",
  ADMIN_PODS_READ:             "admin:pods:read",
  ADMIN_PODS_WRITE:            "admin:pods:write",
  ADMIN_PRINCIPALS_READ:       "admin:principals:read",
  ADMIN_PRINCIPALS_WRITE:      "admin:principals:write",
  ADMIN_WOS_ASSIGNMENTS_WRITE: "admin:wos:assignments:write",
  ADMIN_TENANTS_READ:          "admin:tenants:read",
  ADMIN_TENANTS_WRITE:         "admin:tenants:write",

  // Phase 11 — operational control permissions
  OPS_SYSTEM_READ:   "ops:system:read",    // semantic: system.read
  OPS_IDENTITY_READ: "ops:identity:read",  // semantic: identity.read
  OPS_STATUS_READ:   "ops:status:read",    // semantic: ops.read
  OPS_EXECUTE:       "ops:execute",        // semantic: ops.execute
  OPS_RETRY:         "ops:retry",          // semantic: ops.retry
  OPS_OVERRIDE:      "ops:override",       // semantic: ops.override (superadmin only)
});

// ---------------------------------------------------------------------------
// Semantic class mapping — documents canonical class → native string
// Consumed by evidence runner and governance docs.
// ---------------------------------------------------------------------------
const SEMANTIC_MAP = Object.freeze({
  "system.read":   PERMS.OPS_SYSTEM_READ,
  "identity.read": PERMS.OPS_IDENTITY_READ,
  "admin.read":    PERMS.ADMIN_GOVERNANCE_READ,
  "ops.read":      PERMS.OPS_STATUS_READ,
  "ops.execute":   PERMS.OPS_EXECUTE,
  "ops.retry":     PERMS.OPS_RETRY,
  "ops.override":  PERMS.OPS_OVERRIDE,
});

// ---------------------------------------------------------------------------
// Role-to-permission grants
// ---------------------------------------------------------------------------
function rolePerms(role) {
  const r = String(role || "").trim().toLowerCase();

  // superadmin = sovereign (all permissions)
  if (r === "superadmin") return { all: true, set: new Set() };

  // ops = operational admin (read + execute + retry; NO override)
  if (r === "ops") {
    return {
      all: false,
      set: new Set([
        // Phase 10 grants
        PERMS.ADMIN_STATS_READ,
        PERMS.ADMIN_GOVERNANCE_READ,
        PERMS.ADMIN_WORKERS_READ,
        PERMS.ADMIN_WORKERS_WRITE,
        PERMS.ADMIN_PODS_READ,
        PERMS.ADMIN_PODS_WRITE,
        PERMS.ADMIN_PRINCIPALS_READ,
        PERMS.ADMIN_PRINCIPALS_WRITE,
        PERMS.ADMIN_WOS_ASSIGNMENTS_WRITE,
        PERMS.ADMIN_TENANTS_READ,
        PERMS.ADMIN_TENANTS_WRITE,
        // Phase 11 grants
        PERMS.OPS_SYSTEM_READ,
        PERMS.OPS_IDENTITY_READ,
        PERMS.OPS_STATUS_READ,
        PERMS.OPS_EXECUTE,
        PERMS.OPS_RETRY,
        // PERMS.OPS_OVERRIDE is intentionally excluded — superadmin only
      ])
    };
  }

  // auditor = read-only (no mutations, no operational control)
  if (r === "auditor") {
    return {
      all: false,
      set: new Set([
        // Phase 10 read grants
        PERMS.ADMIN_STATS_READ,
        PERMS.ADMIN_GOVERNANCE_READ,
        PERMS.ADMIN_WORKERS_READ,
        PERMS.ADMIN_PODS_READ,
        PERMS.ADMIN_PRINCIPALS_READ,
        PERMS.ADMIN_TENANTS_READ,
        // Phase 11 read grants only
        PERMS.OPS_SYSTEM_READ,
        PERMS.OPS_IDENTITY_READ,
        // OPS_STATUS_READ, OPS_EXECUTE, OPS_RETRY, OPS_OVERRIDE all denied
      ])
    };
  }

  // default deny-by-role — minimal read (conservative fallback)
  return {
    all: false,
    set: new Set([
      PERMS.ADMIN_STATS_READ,
      PERMS.ADMIN_GOVERNANCE_READ,
    ])
  };
}

// ---------------------------------------------------------------------------
// hasPerm — boolean check (used by existing callers)
// ---------------------------------------------------------------------------
function hasPerm(principal, perm) {
  const role = principal && principal.role ? principal.role : "auditor";
  const rp = rolePerms(role);
  if (rp.all) return true;
  // deny unknown permission (not in catalog) — fail closed
  const knownPerms = new Set(Object.values(PERMS));
  if (!knownPerms.has(String(perm))) return false;
  return rp.set.has(String(perm));
}

// ---------------------------------------------------------------------------
// checkPerm — returns structured decision record (Phase 11)
// Used by requireAdminPerm in server.js to log decisions.
// ---------------------------------------------------------------------------
function checkPerm(principal, perm) {
  const role  = principal && principal.role ? String(principal.role) : "(missing)";
  const actor = principal && principal.id   ? String(principal.id)   : "(missing)";
  const allowed = hasPerm(principal, perm);
  return {
    allowed,
    actor,
    role,
    permission: String(perm),
    decision:   allowed ? "allow" : "deny",
  };
}

// ---------------------------------------------------------------------------
// deny — standardized 403 error object (used by failFromAdmin in server.js)
// ---------------------------------------------------------------------------
function deny(perm) {
  return {
    ok:     false,
    status: 403,
    error:  { code: "FORBIDDEN", message: `missing permission: ${perm}` }
  };
}

module.exports = { PERMS, SEMANTIC_MAP, rolePerms, hasPerm, checkPerm, deny };
