'use strict'

const bcrypt = require('bcryptjs')

const COST_FACTOR = 12

/**
 * Hash a plaintext password using bcrypt.
 * @param {string} password
 * @returns {Promise<string>} bcrypt hash
 */
async function hash(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('password must be a non-empty string')
  }
  if (password.length < 8) {
    throw new Error('password must be at least 8 characters')
  }
  if (password.length > 72) {
    throw new Error('password must be at most 72 characters')
  }
  return bcrypt.hash(password, COST_FACTOR)
}

/**
 * Verify a plaintext password against a bcrypt hash.
 * @param {string} password
 * @param {string} hashStr
 * @returns {Promise<boolean>}
 */
async function verify(password, hashStr) {
  if (!password || !hashStr) return false
  return bcrypt.compare(password, hashStr)
}

module.exports = { hash, verify, COST_FACTOR }
