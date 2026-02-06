"use strict"

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const DEFAULT_DB_PATH = path.join(__dirname, "..", "data", "admin_principals.json")

function nowIso() {
  return new Date().toISOString()
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex")
}

function readJsonFile(p) {
  const raw = fs.readFileSync(p, "utf8")
  return JSON.parse(raw)
}

function writeJsonFileAtomic(p, obj) {
  const tmp = `${p}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8")
  fs.renameSync(tmp, p)
}

function resolveDbPath() {
  return process.env.ADMIN_DB_PATH || DEFAULT_DB_PATH
}

function loadDb() {
  const dbPath = resolveDbPath()
  let db = null
  try {
    db = readJsonFile(dbPath)
  } catch (e) {
    return { ok: false, dbPath, status: 500, error: { code: "ADMIN_DB_UNAVAILABLE", message: "admin db read failed" } }
  }

  if (!db || typeof db !== "object" || !db.roles || !Array.isArray(db.principals)) {
    return { ok: false, dbPath, status: 500, error: { code: "ADMIN_DB_INVALID", message: "admin db schema invalid" } }
  }

  return { ok: true, dbPath, db }
}

function saveDb(dbPath, db) {
  db.updated_at = nowIso()
  writeJsonFileAtomic(dbPath, db)
}

function parseBearer(req) {
  const h = String(req.headers["authorization"] || "").trim()
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1] : null
}

function ensureBootstrap(db, dbPath) {
  const bootstrapToken = String(process.env.ADMIN_BOOTSTRAP_TOKEN || "").trim()
  if (!bootstrapToken) return { ok: true, created: false }

  const tokenHash = sha256Hex(bootstrapToken)
  const exists = db.principals.some(p => p && p.token_hash === tokenHash)
  if (exists) return { ok: true, created: false }

  const principal = {
    id: crypto.randomUUID(),
    name: "bootstrap-superadmin",
    role: "superadmin",
    created_at: nowIso(),
    token_hash: tokenHash
  }
  db.principals.push(principal)
  saveDb(dbPath, db)
  return { ok: true, created: true, principal_id: principal.id }
}

function permissionsFor(db, principal) {
  const roleName = principal.role || "auditor"
  const role = db.roles[roleName]
  const perms = role && Array.isArray(role.permissions) ? role.permissions : []
  return perms
}

function hasPermission(db, principal, requiredPermission) {
  if (!requiredPermission) return true
  const perms = permissionsFor(db, principal)
  if (perms.includes("*")) return true
  return perms.includes(requiredPermission)
}

function authenticate(req) {
  const loaded = loadDb()
  if (!loaded.ok) return loaded

  const { db, dbPath } = loaded
  ensureBootstrap(db, dbPath)

  const token = parseBearer(req)
  if (!token) {
    return { ok: false, status: 401, error: { code: "ADMIN_AUTH_REQUIRED", message: "Authorization Bearer token required" } }
  }

  const tokenHash = sha256Hex(token)
  const principal = db.principals.find(p => p && p.token_hash === tokenHash) || null
  if (!principal) {
    return { ok: false, status: 403, error: { code: "ADMIN_AUTH_INVALID", message: "Invalid admin token" } }
  }

  return { ok: true, status: 200, principal, db, dbPath }
}

function requirePermission(req, permission) {
  const auth = authenticate(req)
  if (!auth.ok) return auth

  if (!hasPermission(auth.db, auth.principal, permission)) {
    return {
      ok: false,
      status: 403,
      error: { code: "ADMIN_FORBIDDEN", message: "Forbidden", required_permission: permission }
    }
  }

  return auth
}

function listPrincipalsSafe(db) {
  return db.principals.map(p => ({
    id: p.id,
    name: p.name,
    role: p.role,
    created_at: p.created_at
  }))
}

function createPrincipal(db, dbPath, input) {
  if (typeof input !== "object" || input === null) {
    return { ok: false, status: 422, error: { code: "VALIDATION_ERROR", message: "body: JSON object required" } }
  }

  const name = String(input.name || "").trim()
  const role = String(input.role || "").trim()

  if (!name) return { ok: false, status: 422, error: { code: "VALIDATION_ERROR", message: "body.name: Field required" } }
  if (!role) return { ok: false, status: 422, error: { code: "VALIDATION_ERROR", message: "body.role: Field required" } }
  if (!db.roles[role]) return { ok: false, status: 422, error: { code: "VALIDATION_ERROR", message: "body.role: Unknown role" } }

  const token = crypto.randomBytes(24).toString("hex")
  const principal = {
    id: crypto.randomUUID(),
    name,
    role,
    created_at: nowIso(),
    token_hash: sha256Hex(token)
  }

  db.principals.push(principal)
  saveDb(dbPath, db)

  return {
    ok: true,
    status: 201,
    principal: { id: principal.id, name: principal.name, role: principal.role, created_at: principal.created_at },
    token
  }
}

module.exports = {
  requirePermission,
  authenticate,
  listPrincipalsSafe,
  createPrincipal
}
