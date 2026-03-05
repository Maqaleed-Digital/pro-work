"use strict";

/**
 * Admin permissions (single source).
 * Keep strings stable: referenced by server handlers and conformance suite.
 *
 * IMPORTANT:
 * This repo currently uses roles in admin principals like:
 * - superadmin
 * - ops
 * - auditor
 *
 * We map those roles deterministically (no schema migration):
 * - superadmin => all permissions
 * - ops       => read + write (incl. principals write)
 * - auditor   => read-only
 */
const PERMS = Object.freeze({
  ADMIN_STATS_READ: "admin:stats:read",
  ADMIN_GOVERNANCE_READ: "admin:governance:read",
  ADMIN_WORKERS_READ: "admin:workers:read",
  ADMIN_WORKERS_WRITE: "admin:workers:write",
  ADMIN_PODS_READ: "admin:pods:read",
  ADMIN_PODS_WRITE: "admin:pods:write",
  ADMIN_PRINCIPALS_READ: "admin:principals:read",
  ADMIN_PRINCIPALS_WRITE: "admin:principals:write",
  ADMIN_WOS_ASSIGNMENTS_WRITE: "admin:wos:assignments:write",
  // S30: tenant registry
  ADMIN_TENANTS_READ:  "admin:tenants:read",
  ADMIN_TENANTS_WRITE: "admin:tenants:write"
});

function rolePerms(role) {
  const r = String(role || "").trim().toLowerCase();

  // superadmin = sovereign admin (all)
  if (r === "superadmin") return { all: true, set: new Set() };

  // ops = operational admin (read + write)
  if (r === "ops") {
    return {
      all: false,
      set: new Set([
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
        PERMS.ADMIN_TENANTS_WRITE
      ])
    };
  }

  // auditor = read-only
  if (r === "auditor") {
    return {
      all: false,
      set: new Set([
        PERMS.ADMIN_STATS_READ,
        PERMS.ADMIN_GOVERNANCE_READ,
        PERMS.ADMIN_WORKERS_READ,
        PERMS.ADMIN_PODS_READ,
        PERMS.ADMIN_PRINCIPALS_READ,
        PERMS.ADMIN_TENANTS_READ
      ])
    };
  }

  // default deny-by-role => read-only (conservative)
  return {
    all: false,
    set: new Set([
      PERMS.ADMIN_STATS_READ,
      PERMS.ADMIN_GOVERNANCE_READ
    ])
  };
}

function hasPerm(principal, perm) {
  const role = principal && principal.role ? principal.role : "auditor";
  const rp = rolePerms(role);
  if (rp.all) return true;
  return rp.set.has(String(perm));
}

/**
 * Standardized admin RBAC error object.
 * server.js failFromAdmin() expects {status, error{code,message}}.
 */
function deny(perm) {
  return {
    ok: false,
    status: 403,
    error: { code: "FORBIDDEN", message: `missing permission: ${perm}` }
  };
}

module.exports = { PERMS, rolePerms, hasPerm, deny };
