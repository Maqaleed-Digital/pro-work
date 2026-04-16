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

  // S31 — enterprise readiness permissions
  ENTERPRISE_READ:          "enterprise:read",          // view enterprise config/RBAC/SSO/procurement
  ENTERPRISE_EXPORT:        "enterprise:export",        // perform audit/evidence exports
  ENTERPRISE_SSO_CONFIG:    "enterprise:sso:config",    // configure SSO/SAML (superadmin/owner only)
  ENTERPRISE_PROCUREMENT:   "enterprise:procurement",   // view procurement controls
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
// S31 Enterprise Role Catalog — mapped to canonical identifiers
// These enterprise roles extend the existing 3-role model.
// Existing tokens with role=superadmin/ops/auditor continue to work unchanged.
// ---------------------------------------------------------------------------
const ENTERPRISE_ROLES = Object.freeze({
  OWNER:              "owner",              // ≡ superadmin (sovereign)
  ADMIN:              "admin",              // ≡ ops (platform administration)
  HIRING_MANAGER:     "hiring_manager",     // workforce + assignment ops
  FINANCE_APPROVER:   "finance_approver",   // payments/export/financial approval
  COMPLIANCE_OFFICER: "compliance_officer", // compliance review + evidence visibility
  AUDITOR_VIEWER:     "auditor_viewer",     // read-only audit/procurement/export
});

// Enterprise role → capability summary (used by RBAC surface)
const ENTERPRISE_ROLE_DESCRIPTIONS = Object.freeze({
  owner:              { label: "Owner",              description: "Full tenant ownership and sovereign governance authority",           capabilities: ["All permissions, including SSO config and override"] },
  admin:              { label: "Admin",              description: "Platform administration and tenant operations",                     capabilities: ["Workers, pods, assignments, payments, tenants, evidence, identity"] },
  hiring_manager:     { label: "Hiring Manager",     description: "Workforce recruiting and assignment operations",                   capabilities: ["Workers read/write, pods read/write, assignments write"] },
  finance_approver:   { label: "Finance Approver",   description: "Payments and financial approval boundary",                        capabilities: ["Payments read, WPS read, export (financial), PDPL read"] },
  compliance_officer: { label: "Compliance Officer", description: "Compliance review and evidence visibility",                       capabilities: ["Compliance read, PDPL read/write, evidence read, ERI read, identity read"] },
  auditor_viewer:     { label: "Auditor / Viewer",   description: "Read-only audit, procurement, and export visibility",             capabilities: ["All reads, evidence export, no writes or overrides"] },
  // Legacy roles (preserved)
  superadmin:         { label: "Super Admin",        description: "Sovereign access (legacy — use owner for new principals)",        capabilities: ["All permissions"] },
  ops:                { label: "Ops",                description: "Operational admin (legacy — use admin for new principals)",       capabilities: ["All except override"] },
  auditor:            { label: "Auditor",            description: "Read-only (legacy — use auditor_viewer for new principals)",      capabilities: ["All reads"] },
});

// ---------------------------------------------------------------------------
// Role-to-permission grants
// ---------------------------------------------------------------------------
function rolePerms(role) {
  const r = String(role || "").trim().toLowerCase();

  // superadmin / owner = sovereign (all permissions)
  if (r === "superadmin" || r === "owner") return { all: true, set: new Set() };

  // ops / admin = operational admin (read + execute + retry; NO override)
  if (r === "ops" || r === "admin") {
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
        // S31 enterprise grants
        PERMS.ENTERPRISE_READ,
        PERMS.ENTERPRISE_EXPORT,
        PERMS.ENTERPRISE_PROCUREMENT,
        // PERMS.OPS_OVERRIDE and PERMS.ENTERPRISE_SSO_CONFIG intentionally excluded
      ])
    };
  }

  // hiring_manager — workforce operations
  if (r === "hiring_manager") {
    return {
      all: false,
      set: new Set([
        PERMS.ADMIN_STATS_READ,
        PERMS.ADMIN_WORKERS_READ,
        PERMS.ADMIN_WORKERS_WRITE,
        PERMS.ADMIN_PODS_READ,
        PERMS.ADMIN_PODS_WRITE,
        PERMS.ADMIN_WOS_ASSIGNMENTS_WRITE,
        PERMS.OPS_IDENTITY_READ,
        PERMS.ENTERPRISE_READ,
      ])
    };
  }

  // finance_approver — payments/export boundary
  if (r === "finance_approver") {
    return {
      all: false,
      set: new Set([
        PERMS.ADMIN_STATS_READ,
        PERMS.ADMIN_WORKERS_READ,
        PERMS.OPS_IDENTITY_READ,
        PERMS.ENTERPRISE_READ,
        PERMS.ENTERPRISE_EXPORT,
        PERMS.ENTERPRISE_PROCUREMENT,
      ])
    };
  }

  // compliance_officer — compliance + evidence visibility
  if (r === "compliance_officer") {
    return {
      all: false,
      set: new Set([
        PERMS.ADMIN_STATS_READ,
        PERMS.ADMIN_GOVERNANCE_READ,
        PERMS.ADMIN_WORKERS_READ,
        PERMS.ADMIN_PODS_READ,
        PERMS.OPS_SYSTEM_READ,
        PERMS.OPS_IDENTITY_READ,
        PERMS.OPS_STATUS_READ,
        PERMS.ENTERPRISE_READ,
        PERMS.ENTERPRISE_EXPORT,
        PERMS.ENTERPRISE_PROCUREMENT,
      ])
    };
  }

  // auditor / auditor_viewer = read-only (no mutations, no operational control)
  if (r === "auditor" || r === "auditor_viewer") {
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
        // S31 enterprise read + export
        PERMS.ENTERPRISE_READ,
        PERMS.ENTERPRISE_EXPORT,
        PERMS.ENTERPRISE_PROCUREMENT,
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

module.exports = { PERMS, SEMANTIC_MAP, ENTERPRISE_ROLES, ENTERPRISE_ROLE_DESCRIPTIONS, rolePerms, hasPerm, checkPerm, deny };
