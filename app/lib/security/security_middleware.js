"use strict"

const rateLimitStore = new Map()
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || "60000")
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "100")

function getRateLimitKey(req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
             req.socket?.remoteAddress ||
             "unknown"
  return `ratelimit:${ip}`
}

function checkRateLimit(req) {
  const key = getRateLimitKey(req)
  const now = Date.now()
  let entry = rateLimitStore.get(key)
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW }
  }
  entry.count++
  rateLimitStore.set(key, entry)

  const remaining = Math.max(0, RATE_LIMIT_MAX - entry.count)
  const headers = {
    "X-RateLimit-Limit": RATE_LIMIT_MAX,
    "X-RateLimit-Remaining": remaining,
    "X-RateLimit-Reset": Math.ceil(entry.resetAt / 1000)
  }

  if (entry.count > RATE_LIMIT_MAX) {
    return { ok: false, headers, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }
  return { ok: true, headers }
}

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "*").split(",").map(s => s.trim())
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
const ALLOWED_HEADERS = "Content-Type, Authorization, X-Tenant-Id, X-Request-Id, X-Actor"

function getCorsHeaders(req) {
  const origin = req.headers.origin || "*"
  const allowedOrigin = ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400"
  }
}

function getSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()"
  }
}

function generateRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`
}

function sanitizeInput(input) {
  if (typeof input === "string") {
    return input.replace(/[<>]/g, "").trim().slice(0, 10000)
  }
  if (Array.isArray(input)) {
    return input.slice(0, 1000).map(sanitizeInput)
  }
  if (input && typeof input === "object") {
    const sanitized = {}
    for (const [key, value] of Object.entries(input)) {
      if (key.length <= 100 && !key.startsWith("$")) sanitized[key] = sanitizeInput(value)
    }
    return sanitized
  }
  return input
}

const blockedIPs = new Set()

function blockIP(ip) {
  blockedIPs.add(ip)
}

function unblockIP(ip) {
  blockedIPs.delete(ip)
}

function isIPBlocked(req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
             req.socket?.remoteAddress
  return blockedIPs.has(ip)
}

const MAX_BODY_SIZE = parseInt(process.env.MAX_BODY_SIZE || "1048576")

function checkBodySize(req) {
  const contentLength = parseInt(req.headers["content-length"] || "0")
  return contentLength <= MAX_BODY_SIZE
}

function applySecurityMiddleware(req, res) {
  const requestId = req.headers["x-request-id"] || generateRequestId()

  if (isIPBlocked(req)) {
    return {
      ok: false,
      status: 403,
      error: { code: "FORBIDDEN", message: "IP blocked" },
      headers: { "X-Request-Id": requestId }
    }
  }

  const rateLimit = checkRateLimit(req)
  if (!rateLimit.ok) {
    return {
      ok: false,
      status: 429,
      error: { code: "RATE_LIMITED", message: "Too many requests" },
      headers: { ...rateLimit.headers, "X-Request-Id": requestId, "Retry-After": rateLimit.retryAfter }
    }
  }

  if (!checkBodySize(req)) {
    return {
      ok: false,
      status: 413,
      error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" },
      headers: { "X-Request-Id": requestId }
    }
  }

  return {
    ok: true,
    requestId,
    headers: {
      ...getCorsHeaders(req),
      ...getSecurityHeaders(),
      ...rateLimit.headers,
      "X-Request-Id": requestId
    }
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt + RATE_LIMIT_WINDOW) rateLimitStore.delete(key)
  }
}, 60000)

module.exports = {
  checkRateLimit,
  getCorsHeaders,
  getSecurityHeaders,
  generateRequestId,
  sanitizeInput,
  blockIP,
  unblockIP,
  isIPBlocked,
  checkBodySize,
  applySecurityMiddleware
}
