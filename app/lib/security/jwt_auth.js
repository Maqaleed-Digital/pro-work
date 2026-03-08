"use strict"

const crypto = require("crypto")

const JWT_SECRET = process.env.JWT_SECRET || "prowork-dev-secret-change-in-production"
const JWT_EXPIRY = parseInt(process.env.JWT_EXPIRY || "86400")

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/")
  while (str.length % 4) str += "="
  return Buffer.from(str, "base64").toString("utf8")
}

function sign(data) {
  return crypto
    .createHmac("sha256", JWT_SECRET)
    .update(data)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

function generateToken(payload) {
  const header = { alg: "HS256", typ: "JWT" }
  const now = Math.floor(Date.now() / 1000)
  const claims = { ...payload, iat: now, exp: now + JWT_EXPIRY, jti: crypto.randomUUID() }
  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(claims))
  const signature = sign(`${headerB64}.${payloadB64}`)
  return `${headerB64}.${payloadB64}.${signature}`
}

function verifyToken(token) {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return { ok: false, error: "Invalid token format" }
    const [headerB64, payloadB64, signature] = parts
    const expectedSignature = sign(`${headerB64}.${payloadB64}`)
    if (signature !== expectedSignature) return { ok: false, error: "Invalid signature" }
    const payload = JSON.parse(base64UrlDecode(payloadB64))
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) return { ok: false, error: "Token expired" }
    return { ok: true, payload }
  } catch (err) {
    return { ok: false, error: "Token verification failed" }
  }
}

function refreshToken(token) {
  const verified = verifyToken(token)
  if (!verified.ok) return verified
  const { iat, exp, jti, ...payload } = verified.payload
  return { ok: true, token: generateToken(payload) }
}

const ROLES = {
  superadmin: { name: "Super Administrator", permissions: ["*"] },
  admin: {
    name: "Administrator",
    permissions: ["admin:read","admin:write","workers:read","workers:write","pods:read","pods:write","tenants:read","evidence:read","audit:read"]
  },
  ops: {
    name: "Operations",
    permissions: ["admin:read","workers:read","workers:write","pods:read","pods:write","evidence:read","scheduler:write"]
  },
  auditor: {
    name: "Auditor",
    permissions: ["admin:read","workers:read","pods:read","evidence:read","audit:read"]
  },
  viewer: {
    name: "Viewer",
    permissions: ["admin:read","workers:read","pods:read"]
  }
}

function hasPermission(role, permission) {
  const roleConfig = ROLES[role]
  if (!roleConfig) return false
  if (roleConfig.permissions.includes("*")) return true
  return roleConfig.permissions.includes(permission)
}

function getRolePermissions(role) {
  const roleConfig = ROLES[role]
  return roleConfig ? roleConfig.permissions : []
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex")
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex")
  return `${salt}:${hash}`
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":")
  const verify = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex")
  return hash === verify
}

function extractToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization
  if (!auth) return null
  const parts = auth.split(" ")
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null
  return parts[1]
}

function requireAuth(permission = null) {
  return (req, res, next) => {
    const token = extractToken(req)
    if (!token) {
      return { ok: false, status: 401, error: { code: "UNAUTHORIZED", message: "Missing token" } }
    }
    const verified = verifyToken(token)
    if (!verified.ok) {
      return { ok: false, status: 401, error: { code: "UNAUTHORIZED", message: verified.error } }
    }
    if (permission && !hasPermission(verified.payload.role, permission)) {
      return { ok: false, status: 403, error: { code: "FORBIDDEN", message: `Missing permission: ${permission}` } }
    }
    return { ok: true, principal: verified.payload }
  }
}

module.exports = {
  generateToken,
  verifyToken,
  refreshToken,
  ROLES,
  hasPermission,
  getRolePermissions,
  hashPassword,
  verifyPassword,
  extractToken,
  requireAuth
}
