"use strict"

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

function nowIso() {
  return new Date().toISOString()
}

function ok(data) {
  return { ok: true, data }
}

function err(status, code, message) {
  return {
    ok: false,
    status: Number(status) || 500,
    error: {
      code: String(code || "ADMIN_ERROR"),
      message: String(message || "admin error")
    }
  }
}

function principalsFilePath() {
  const root = path.resolve(__dirname, "..")
  return path.join(root, "data", "admin_principals.json")
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8")
  return JSON.parse(raw)
}

function writeJsonFile(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8")
}

function normalizeDb(j) {
  const principals = Array.isArray(j)
    ? j
    : Array.isArray(j && j.principals)
      ? j.principals
      : Array.isArray(j && j.items)
        ? j.items
        : []

  const roles =
    j && typeof j === "object" && !Array.isArray(j) && j.roles && typeof j.roles === "object"
      ? j.roles
      : {}

  return { principals, roles }
}

function loadDbFromPath(dbPath) {
  try {
    const j = readJsonFile(dbPath)
    const norm = normalizeDb(j)
    return ok({ db: { principals: norm.principals, roles: norm.roles }, raw: j })
  } catch (e) {
    return err(500, "ADMIN_CONFIG_ERROR", `failed to read admin principals file: ${dbPath}`)
  }
}

function parseAuthorization(req) {
  const h = req && req.headers ? (req.headers.authorization || req.headers.Authorization) : null
  const v = h === undefined || h === null ? "" : String(h).trim()
  if (!v) return err(401, "UNAUTHORIZED", "missing Authorization header")

  const parts = v.split(/\s+/)
  if (parts.length !== 2) return err(401, "UNAUTHORIZED", "invalid Authorization header")
  if (String(parts[0]).toLowerCase() !== "bearer") return err(401, "UNAUTHORIZED", "Authorization must be Bearer token")

  const token = String(parts[1] || "").trim()
  if (!token) return err(401, "UNAUTHORIZED", "missing bearer token")
  return ok({ token })
}

function permissionsForRole(db, roleName) {
  const r = db && db.roles ? db.roles[roleName] : null
  const perms = r && Array.isArray(r.permissions) ? r.permissions.map(x => String(x)) : []
  return perms
}

function hasPermission(perms, required) {
  const req = String(required || "")
  if (!req) return true
  if (perms.includes("*")) return true
  return perms.includes(req)
}

function findPrincipalByToken(db, token) {
  const t = String(token)
  const principals = db && Array.isArray(db.principals) ? db.principals : []
  const hit = principals.find(p => p && String(p.token || "") === t)
  if (!hit) return null
  if (String(hit.status || "active") !== "active") return null
  return hit
}

function requirePermission(req, requiredPermission) {
  const auth = parseAuthorization(req)
  if (!auth.ok) return auth

  const dbPath = principalsFilePath()
  const loaded = loadDbFromPath(dbPath)
  if (!loaded.ok) return loaded

  const db = loaded.data.db
  const principal = findPrincipalByToken(db, auth.data.token)
  if (!principal) return err(401, "UNAUTHORIZED", "invalid token")

  const roleName = String(principal.role || "")
  const perms = permissionsForRole(db, roleName)

  if (!hasPermission(perms, requiredPermission)) {
    return err(403, "FORBIDDEN", "forbidden")
  }

  return {
    ok: true,
    principal: {
      id: String(principal.id || ""),
      name: String(principal.name || ""),
      role: roleName,
      status: String(principal.status || "active")
    },
    db,
    dbPath
  }
}

function listPrincipalsSafe(db) {
  const principals = db && Array.isArray(db.principals) ? db.principals : []
  return principals.map(p => {
    return {
      id: String(p.id || ""),
      name: String(p.name || ""),
      role: String(p.role || ""),
      status: String(p.status || "active"),
      created_at: p.created_at || null,
      updated_at: p.updated_at || null
    }
  })
}

function createPrincipal(db, dbPath, body) {
  try {
    const name = body && body.name !== undefined ? String(body.name).trim() : ""
    const role = body && body.role !== undefined ? String(body.role).trim() : ""
    const token = body && body.token !== undefined ? String(body.token).trim() : ""
    const status = body && body.status !== undefined ? String(body.status).trim() : "active"

    if (!name) return err(422, "VALIDATION_ERROR", "body.name: Field required")
    if (!role) return err(422, "VALIDATION_ERROR", "body.role: Field required")
    if (!token) return err(422, "VALIDATION_ERROR", "body.token: Field required")
    if (!db || !db.roles || !db.roles[role]) return err(422, "VALIDATION_ERROR", "body.role: Unknown role")

    const principals = Array.isArray(db.principals) ? db.principals : []
    if (principals.some(x => x && String(x.token || "") === token)) return err(409, "CONFLICT", "token already exists")

    const t = nowIso()
    const created = {
      id: `adm_${crypto.randomUUID()}`,
      name,
      role,
      status,
      token,
      created_at: t,
      updated_at: t
    }

    const nextDb = { ...db, principals: principals.concat([created]) }

    const loaded = loadDbFromPath(dbPath)
    if (!loaded.ok) return loaded

    const raw = loaded.data.raw
    let nextRaw
    if (Array.isArray(raw)) {
      nextRaw = nextDb.principals
    } else if (raw && typeof raw === "object") {
      nextRaw = { ...raw, principals: nextDb.principals }
    } else {
      nextRaw = { principals: nextDb.principals, roles: nextDb.roles }
    }

    writeJsonFile(dbPath, nextRaw)

    return ok({
      id: created.id,
      name: created.name,
      role: created.role,
      status: created.status,
      created_at: created.created_at,
      updated_at: created.updated_at
    })
  } catch (e) {
    return err(500, "ADMIN_INTERNAL_ERROR", "failed to create principal")
  }
}

function bootstrapSuperadmin(req, expectedBootstrapToken) {
  const got = req && req.headers ? String(req.headers["x-admin-bootstrap-token"] || "").trim() : ""
  const expected = String(expectedBootstrapToken || "").trim()

  if (!expected) return err(500, "ADMIN_CONFIG_ERROR", "ADMIN_BOOTSTRAP_TOKEN is not configured")
  if (!got) return err(401, "UNAUTHORIZED", "missing x-admin-bootstrap-token")
  if (got !== expected) return err(401, "UNAUTHORIZED", "invalid bootstrap token")

  const dbPath = principalsFilePath()
  const loaded = loadDbFromPath(dbPath)
  if (!loaded.ok) return loaded

  const db = loaded.data.db
  const principals = Array.isArray(db.principals) ? db.principals : []
  if (principals.length > 0) return ok({ skipped: true, reason: "principals already exist" })

  if (!db.roles || !db.roles.superadmin) {
    return err(500, "ADMIN_CONFIG_ERROR", "roles.superadmin missing in principals file")
  }

  const t = nowIso()
  const seed = {
    id: "adm_bootstrap_superadmin",
    name: "bootstrap-superadmin",
    role: "superadmin",
    status: "active",
    token: "sk-bootstrap-superadmin-001",
    created_at: t,
    updated_at: t
  }

  const nextDb = { ...db, principals: [seed] }

  const raw = loaded.data.raw
  let nextRaw
  if (Array.isArray(raw)) {
    nextRaw = nextDb.principals
  } else if (raw && typeof raw === "object") {
    nextRaw = { ...raw, principals: nextDb.principals }
  } else {
    nextRaw = { principals: nextDb.principals, roles: nextDb.roles }
  }

  writeJsonFile(dbPath, nextRaw)
  return ok({ created: true, principal_id: seed.id })
}

module.exports = {
  ok,
  err,
  principalsFilePath,

  requirePermission,
  requireAdmin: requirePermission,
  requireAuth: requirePermission,

  listPrincipalsSafe,
  createPrincipal,

  bootstrapSuperadmin
}
