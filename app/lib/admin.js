"use strict"

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

function nowIso() {
  return new Date().toISOString()
}

function loadDb(dbPath) {
  const raw = fs.readFileSync(dbPath, "utf8")
  const j = JSON.parse(raw)

  const principals =
    Array.isArray(j) ? j : Array.isArray(j.principals) ? j.principals : Array.isArray(j.items) ? j.items : []

  const roles = j && typeof j === "object" && j.roles && typeof j.roles === "object" ? j.roles : {}

  const version = j && typeof j === "object" && Number.isFinite(Number(j.version)) ? Number(j.version) : 1
  const updated_at = j && typeof j === "object" && typeof j.updated_at === "string" ? j.updated_at : "1970-01-01T00:00:00.000Z"

  return { version, updated_at, principals, roles }
}

function saveDb(dbPath, db) {
  const out = {
    version: db.version || 1,
    updated_at: nowIso(),
    principals: Array.isArray(db.principals) ? db.principals : [],
    roles: db.roles && typeof db.roles === "object" ? db.roles : {}
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  fs.writeFileSync(dbPath, JSON.stringify(out, null, 2) + "\n", "utf8")
  return out
}

function err(status, code, message) {
  return { ok: false, status, error: { code, message } }
}

function parseAuth(req) {
  const h = req && req.headers ? req.headers.authorization || req.headers.Authorization : null
  const s = h === undefined || h === null ? "" : String(h).trim()
  if (!s) return { ok: false, kind: "missing" }
  const parts = s.split(/\s+/)
  if (parts.length < 2) return { ok: false, kind: "bad_scheme" }
  const scheme = String(parts[0] || "")
  const token = String(parts.slice(1).join(" ") || "").trim()
  if (scheme.toLowerCase() !== "bearer") return { ok: false, kind: "bad_scheme" }
  if (!token) return { ok: false, kind: "missing" }
  return { ok: true, token }
}

function rolePerms(db, role) {
  const r = db.roles && db.roles[role] ? db.roles[role] : null
  const perms = r && Array.isArray(r.permissions) ? r.permissions.map(x => String(x)) : []
  return perms
}

function principalHas(db, principal, perm) {
  const role = String(principal && principal.role ? principal.role : "")
  const perms = rolePerms(db, role)

  if (perms.includes("*")) return true
  if (perm === "*" && !perms.includes("*")) return false

  return perms.includes(String(perm))
}

function findPrincipalByToken(db, token) {
  const arr = Array.isArray(db.principals) ? db.principals : []
  return arr.find(p => String(p && p.token ? p.token : "") === String(token)) || null
}

function listPrincipalsSafe(db) {
  const arr = Array.isArray(db.principals) ? db.principals : []
  return arr.map(p => ({
    id: String(p.id || ""),
    name: String(p.name || ""),
    role: String(p.role || ""),
    status: String(p.status || ""),
    created_at: p.created_at || null,
    updated_at: p.updated_at || null
  }))
}

function requirePermission(req, permission, opts) {
  const o = opts && typeof opts === "object" ? opts : {}
  const dbPath =
    typeof o.dbPath === "string" && o.dbPath.trim()
      ? o.dbPath
      : path.join(process.cwd(), "data", "admin_principals.json")

  let db
  try {
    db = loadDb(dbPath)
  } catch (e) {
    return err(500, "ADMIN_DB_ERROR", "Admin principals store is not readable")
  }

  const auth = parseAuth(req)
  if (!auth.ok) {
    return err(401, "ADMIN_AUTH_REQUIRED", "Authorization Bearer token required")
  }

  const principal = findPrincipalByToken(db, auth.token)
  if (!principal) {
    return err(401, "ADMIN_AUTH_INVALID", "Invalid admin token")
  }

  if (String(principal.status || "active") !== "active") {
    return err(403, "FORBIDDEN", "Principal is not active")
  }

  if (!principalHas(db, principal, permission)) {
    return err(403, "FORBIDDEN", "Insufficient permissions")
  }

  return { ok: true, principal, db, dbPath }
}

function bootstrapSuperadmin(req, dbPath, name) {
  let db
  try {
    db = loadDb(dbPath)
  } catch {
    return err(500, "ADMIN_DB_ERROR", "Admin principals store is not readable")
  }

  const n = Array.isArray(db.principals) ? db.principals.length : 0
  if (n > 0) return err(409, "ALREADY_BOOTSTRAPPED", "Principals already exist")

  const t = nowIso()
  const id = `adm_${crypto.randomUUID()}`
  const token = `sk-${crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex").slice(0, 48)}`

  const p = {
    id,
    name: String(name || "bootstrap-superadmin"),
    role: "superadmin",
    status: "active",
    token,
    created_at: t,
    updated_at: t
  }

  db.principals = [p]
  db = saveDb(dbPath, db)

  return { ok: true, principal: { id: p.id, name: p.name, role: p.role, status: p.status }, token, db }
}

function createPrincipal(db, dbPath, input) {
  if (!input || typeof input !== "object") return err(422, "VALIDATION_ERROR", "body: JSON object required")
  const name = String(input.name || "").trim()
  const role = String(input.role || "").trim()

  if (!name) return err(422, "VALIDATION_ERROR", "body.name: Field required")
  if (!role) return err(422, "VALIDATION_ERROR", "body.role: Field required")

  const roles = db.roles && typeof db.roles === "object" ? db.roles : {}
  if (!roles[role]) return err(422, "VALIDATION_ERROR", "body.role: Unknown role")

  const t = nowIso()
  const id = `adm_${crypto.randomUUID()}`
  const token = `sk-${crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex").slice(0, 48)}`

  const p = {
    id,
    name,
    role,
    status: "active",
    token,
    created_at: t,
    updated_at: t
  }

  const arr = Array.isArray(db.principals) ? db.principals.slice() : []
  arr.push(p)

  const next = { ...db, principals: arr }
  saveDb(dbPath, next)

  return { ok: true, principal: { id: p.id, name: p.name, role: p.role, status: p.status }, token }
}

module.exports = {
  requirePermission,
  listPrincipalsSafe,
  createPrincipal,
  bootstrapSuperadmin
}
