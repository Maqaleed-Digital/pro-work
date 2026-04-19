'use strict'

const crypto = require('crypto')

const ALG       = 'HS256'
const TOKEN_TTL = 3600 // 1 hour in seconds

function base64url(buf) {
  return (Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64urlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return Buffer.from(s, 'base64')
}

function sign(payload, secret) {
  const header = base64url(JSON.stringify({ alg: ALG, typ: 'JWT' }))
  const body   = base64url(JSON.stringify(payload))
  const sig    = crypto.createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest()
  return `${header}.${body}.${base64url(sig)}`
}

function decode(token, secret) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [header, body, sig] = parts
  const expected = crypto.createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest()
  const actual = base64urlDecode(sig)

  if (expected.length !== actual.length) return null
  if (!crypto.timingSafeEqual(expected, actual)) return null

  try {
    return JSON.parse(base64urlDecode(body).toString('utf8'))
  } catch {
    return null
  }
}

/**
 * Create a JWT service bound to a secret.
 * @param {Object} opts
 * @param {string} opts.secret - HMAC secret (from JWT_SECRET env var)
 * @param {number} [opts.ttl]  - token TTL in seconds (default 3600)
 */
function createJwtService(opts) {
  if (!opts || !opts.secret) {
    throw new Error('JWT_SECRET is required')
  }
  const secret = opts.secret
  const ttl    = opts.ttl || TOKEN_TTL

  return {
    /**
     * Issue a JWT for a user.
     * @param {string} userId
     * @param {string} role
     * @param {string} tenantId
     * @returns {{ token: string, expiresAt: Date }}
     */
    issue(userId, role, tenantId, personaType) {
      const now       = Math.floor(Date.now() / 1000)
      const expiresAt = now + ttl
      const payload   = {
        sub:       userId,
        role:      role,
        tenant_id: tenantId,
        persona_type: personaType || 'EMPLOYER',
        iat:       now,
        exp:       expiresAt,
        jti:       crypto.randomUUID(),
      }
      return {
        token:     sign(payload, secret),
        expiresAt: new Date(expiresAt * 1000),
        jti:       payload.jti,
      }
    },

    /**
     * Verify and decode a JWT. Returns null if invalid or expired.
     * @param {string} token
     * @returns {Object|null} decoded payload or null
     */
    verify(token) {
      const payload = decode(token, secret)
      if (!payload) return null
      const now = Math.floor(Date.now() / 1000)
      if (payload.exp && payload.exp < now) return null
      return payload
    },

    /**
     * Refresh a token — issues a new token with same claims, new exp/jti.
     * @param {string} token
     * @returns {{ token: string, expiresAt: Date }|null}
     */
    refresh(token) {
      const payload = this.verify(token)
      if (!payload) return null
      return this.issue(payload.sub, payload.role, payload.tenant_id)
    },

    /**
     * Hash a token for session storage (SHA-256).
     * @param {string} token
     * @returns {string}
     */
    hashToken(token) {
      return crypto.createHash('sha256').update(token).digest('hex')
    },
  }
}

module.exports = { createJwtService }
