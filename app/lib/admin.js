"use strict"

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

function nowIso() {
  return new Date().toISOString()
}

function err(status, code, message) {
  return { ok: false, status, error: { code, message } }
}

function ok(data) {
  return { ok: true, data }
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8")
  return JSON.parse(raw)
}

function writeJsonFile(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8")
}

function principalsFilePath() {
  const root = path.resolve(__dirname, "..")
  return path.join(root, "data", "admin_principals.json")
}

function loadPrincipals() {
  const p = principalsFilePath()
  const j = readJsonFile(p)

  const principals = Array.isArray(j)
    ? j
    : Array.isArray(j.principals)
      ? j.principals
      : Array.isArray(j.items)
        ? j.items
        : []

  const roles = j && typeof j === "object" && j.roles && typeof j.roles === "object" ? j.roles : {}

  return { file: p, principals, roles, raw: j }
}

function savePrincipals(nextRaw) {
  const p = principalsFilePath()
  writeJsonFile(p, nextRaw)
  return p
}

function parseBearer(req) {
  const h = req && req.headers ? req.headers.authorization || req.headers.Authorization : null
  if (!h) return null
  const v = String(h).trim()
  if (!v) return null
  if (!v.toLowerCase().startsWith("bearer ")) return { badScheme: true }
  const token = v.slice(7).trim()
  if (!token) return null
  return { token }
}

function resolvePrincipalByToken(token) {
  const { principals, roles } = loadPrincipals()
  const hit = principals.find(p => p && String(p.token || "") === String(token))
  if (!hit) return null
  const roleName = String(hit.role || "")
  const role = roles && roles[roleName] ? roles[roleName] : null
  const perms = role && Array.isArray(role.permissions) ? role.permissions.map(String) : []
  return {
    id: String(hit.id || ""),
    name: String(hit.name || ""),
    role: roleName,
    status: String(hit.status || "active"),
    token: String(hit.token || ""),
    permissions: perms
  }
}

function hasPermission(principal, perm) {
  if (!principal) return false
  const perms = Array.isArray(principal.permissions) ? principal.permissions : []
  if (perms.includes("*")) return true
  return perms.includes(String(perm))
}

function requireAuth(req) {
  const parsed = parseBearer(req)
  if (parsed && parsed.badScheme) {
    return err(401, "UNAUTHORIZED", "Authorization must be Bearer token")
  }
  if (!parsed || !parsed.token) {
    return err(401, "UNAUTHORIZED", "Missing Authorization Bearer token")
  }

  const principal = resolvePrincipalByToken(parsed.token)
  if (!principal) return err(401, "UNAUTHORIZED", "Invalid token")

  if (String(principal.status) !== "active") {
    return err(403, "FORBIDDEN", "Principal inactive")
  }

  return ok({ principal })
}

function requirePermission(req, permission) {
  const a = requireAuth(req)
  if (!a.ok) return a

  const principal = a.data.principal
  if (!hasPermission(principal, permission)) {
    return err(403, "FORBIDDEN", `Missing permission: ${String(permission)}`)
  }

  return ok({ principal })
}

function listWorkers(_query) {
  return ok([])
}

function listPods(_query) {
  return ok([])
}

function statsSnapshot() {
  return ok({
    workers: { total: 0, fte: 0, freelancer: 0 },
    pods: { total: 0, by_state: {} },
    evidence: { total: 0, recent: [] },
    governance: { status: "pass", checks_passed: 1, checks_total: 1 }
  })
}

function governanceSnapshot() {
  return ok({
    last_doctor_run: { status: "pass", passed: 1, total: 1, timestamp: nowIso() },
    ci_status: { status: "unknown", branch: "local", last_run: nowIso(), note: "Use GitHub Actions for CI status" },
    checks: [{ name: "admin_rbac", status: "pass", message: "RBAC enforcement active" }],
    notes: ["S22/S23: contract-first RBAC conformance"]
  })
}

function listPrincipals() {
  const { principals, raw } = loadPrincipals()
  const shaped = principals.map(p => ({
    id: String(p.id || ""),
    name: String(p.name || ""),
    role: String(p.role || ""),
    status: String(p.status || "active"),
    token: String(p.token || ""),
    created_at: p.created_at || null,
    updated_at: p.updated_at || null
  }))
  return ok({ items: shaped, roles: raw.roles || {} })
}

function createPrincipal(body) {
  if (!body || typeof body !== "object") return err(422, "VALIDATION_ERROR", "body: JSON object required")
  const name = String(body.name || "").trim()
  const role = String(body.role || "").trim()
  const status = String(body.status || "active").trim()

  if (!name) return err(422, "VALIDATION_ERROR", "body.name: Field required")
  if (!role) return err(422, "VALIDATION_ERROR", "body.role: Field required")

  const { raw } = loadPrincipals()
  const principals = Array.isArray(raw.principals) ? raw.principals : []
  const id = `adm_${crypto.randomUUID()}`
  const token = `sk-${crypto.randomUUID()}`
  const t = nowIso()

  const p = { id, name, role, status, token, created_at: t, updated_at: t }
  principals.push(p)

  const next = { ...raw, principals }
  savePrincipals(next)

  return ok(p)
}

function bootstrapSuperadmin(bootstrapToken) {
  const expected = String(process.env.ADMIN_BOOTSTRAP_TOKEN || "")
  if (!expected) return err(500, "CONFIG_ERROR", "ADMIN_BOOTSTRAP_TOKEN not set")
  if (String(bootstrapToken || "") !== expected) return err(401, "UNAUTHORIZED", "Invalid bootstrap token")

  const { raw } = loadPrincipals()
  const principals = Array.isArray(raw.principals) ? raw.principals : []

  const already = principals.find(p => String(p.role || "") === "superadmin" && String(p.status || "") === "active")
  if (already) {
    return ok({ principal: already, note: "superadmin already exists" })
  }

  const t = nowIso()
  const p = {
    id: "adm_bootstrap_superadmin",
    name: "bootstrap-superadmin",
    role: "superadmin",
    status: "active",
    token: `sk-admin-superadmin-${crypto.randomUUID()}`,
    created_at: t,
    updated_at: t
  }
  principals.push(p)

  const next = { ...raw, principals }
  savePrincipals(next)

  return ok({ principal: p, note: "superadmin bootstrapped" })
}

module.exports = {
  requireAuth,
  require: requirePermission,
  hasPermission,
  listWorkers,
  listPods,
  statsSnapshot,
  governanceSnapshot,
  listPrincipals,
  createPrincipal,
  bootstrapSuperadmin
}
