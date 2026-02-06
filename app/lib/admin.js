"use strict"

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

function nowIso() {
  return new Date().toISOString()
}

function readJsonFile(p) {
  const raw = fs.readFileSync(p, "utf8")
  return JSON.parse(raw)
}

function writeJsonFileAtomic(p, obj) {
  const dir = path.dirname(p)
  const tmp = path.join(dir, `.tmp_${path.basename(p)}_${crypto.randomUUID()}`)
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8")
  fs.renameSync(tmp, p)
}

function normalizeStore(j) {
  const principals = Array.isArray(j)
    ? j
    : Array.isArray(j.principals)
      ? j.principals
      : Array.isArray(j.items)
        ? j.items
        : []

  const roles = !Array.isArray(j) && j && typeof j === "object" && j.roles && typeof j.roles === "object"
    ? j.roles
    : {}

  return { principals, roles }
}

function parseAuthHeader(req) {
  const h = req && req.headers ? req.headers.authorization || req.headers.Authorization : null
  if (!h) return { kind: "missing" }

  const s = String(h).trim()
  if (!s) return { kind: "missing" }

  const parts = s.split(/\s+/)
  if (parts.length < 2) return { kind: "invalid" }

  const scheme = String(parts[0] || "").toLowerCase()
  const token = parts.slice(1).join(" ").trim()

  if (scheme === "basic") return { kind: "basic" }
  if (scheme !== "bearer") return { kind: "invalid" }
  if (!token) return { kind: "missing" }

  return { kind: "bearer", token }
}

function effectivePermissionFromRequest(req) {
  const url = String(req && req.url ? req.url : "")
  const method = String(req && req.method ? req.method : "GET").toUpperCase()

  if (url.startsWith("/api/admin/stats")) return "admin.stats.read"
  if (url.startsWith("/api/admin/governance")) return "admin.governance.read"
  if (url.startsWith("/api/admin/workers")) return "admin.workers.read"
  if (url.startsWith("/api/admin/pods")) return "admin.pods.read"

  if (url.startsWith("/api/admin/principals")) {
    if (method === "POST") return "admin.principals.write"
    return "admin.principals.read"
  }

  return null
}

class Admin {
  constructor(opts = {}) {
    const root = opts.root || path.resolve(__dirname, "..")
    this.root = root
    this.principalsFile = opts.principalsFile || path.resolve(root, "data", "admin_principals.json")
    this.bootstrapToken = opts.bootstrapToken || process.env.ADMIN_BOOTSTRAP_TOKEN || ""
  }

  load() {
    const j = readJsonFile(this.principalsFile)
    return normalizeStore(j)
  }

  save(store) {
    const payload = { principals: store.principals || [], roles: store.roles || {} }
    writeJsonFileAtomic(this.principalsFile, payload)
  }

  unauthorized() {
    return { status: 401, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }
  }

  forbidden() {
    return { status: 403, error: { code: "FORBIDDEN", message: "Forbidden" } }
  }

  resolvePrincipal(req) {
    const parsed = parseAuthHeader(req)

    if (parsed.kind === "missing") return { ok: false, ...this.unauthorized() }
    if (parsed.kind === "basic") return { ok: false, ...this.unauthorized() }
    if (parsed.kind !== "bearer") return { ok: false, ...this.unauthorized() }

    const token = parsed.token
    const store = this.load()

    const principal = (store.principals || []).find(p => String(p && p.token ? p.token : "") === String(token))
    if (!principal) return { ok: false, ...this.unauthorized() }
    if (String(principal.status || "active") !== "active") return { ok: false, ...this.unauthorized() }

    return { ok: true, principal, store }
  }

  hasPermission(store, principal, requiredPerm) {
    const roleName = String(principal && principal.role ? principal.role : "")
    const role = store.roles && store.roles[roleName] ? store.roles[roleName] : null
    const perms = role && Array.isArray(role.permissions) ? role.permissions.map(String) : []

    if (perms.includes("*")) return true
    if (!requiredPerm) return false

    return perms.includes(String(requiredPerm))
  }

  require(req, requiredPerm) {
    const resolved = this.resolvePrincipal(req)
    if (!resolved.ok) return resolved

    const store = resolved.store
    const principal = resolved.principal

    const mapped = requiredPerm === "admin.read" ? effectivePermissionFromRequest(req) : null
    const effective = mapped || requiredPerm

    if (!this.hasPermission(store, principal, effective)) {
      return { ok: false, ...this.forbidden(), principal }
    }

    return { ok: true, principal, store }
  }

  bootstrapSuperadmin(req, name) {
    const parsed = parseAuthHeader(req)
    if (parsed.kind !== "bearer") return { ok: false, ...this.unauthorized() }

    const token = String(parsed.token || "")
    if (!this.bootstrapToken || token !== String(this.bootstrapToken)) return { ok: false, ...this.unauthorized() }

    const store = this.load()
    const principals = store.principals || []

    const exists = principals.find(p => String(p && p.role ? p.role : "") === "superadmin")
    if (exists) {
      return { ok: false, status: 409, error: { code: "ALREADY_EXISTS", message: "superadmin already exists" } }
    }

    const t = nowIso()
    const principal = {
      id: `adm_${crypto.randomUUID()}`,
      name: String(name || "bootstrap-superadmin"),
      role: "superadmin",
      status: "active",
      token: `sk-admin-${crypto.randomUUID()}`,
      created_at: t,
      updated_at: t
    }

    principals.push(principal)
    store.principals = principals

    if (!store.roles || typeof store.roles !== "object") store.roles = {}
    if (!store.roles.superadmin) store.roles.superadmin = { description: "Full access", permissions: ["*"] }

    this.save(store)
    return { ok: true, status: 201, data: principal }
  }

  listPrincipals() {
    const store = this.load()
    return store.principals || []
  }

  createPrincipal(name, role) {
    const store = this.load()
    const t = nowIso()

    const principal = {
      id: `adm_${crypto.randomUUID()}`,
      name: String(name || "").trim(),
      role: String(role || "").trim(),
      status: "active",
      token: `sk-admin-${crypto.randomUUID()}`,
      created_at: t,
      updated_at: t
    }

    store.principals = Array.isArray(store.principals) ? store.principals : []
    store.principals.push(principal)
    this.save(store)

    return principal
  }
}

module.exports = Admin
