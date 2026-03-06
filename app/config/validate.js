"use strict"

/**
 * S35: Production config validation.
 * Called at startup. Exits with code 1 in NODE_ENV=production if required
 * env vars are missing or set to known-unsafe placeholder values.
 */

const REQUIRED = [
  "PORT",
  "PUBLIC_BASE_URL",
  "CORS_ALLOWED_ORIGINS",
  "ADMIN_API_TOKEN",
  "PROWORK_DATA_DIR",
]

const UNSAFE = new Set(["changeme", "default", "test", "123456"])

function isUnsafe(v) {
  const s = String(v || "").trim().toLowerCase()
  return !s || UNSAFE.has(s)
}

function validateProductionConfig() {
  if (process.env.NODE_ENV !== "production") return

  const errors = []
  for (const key of REQUIRED) {
    const val = process.env[key]
    if (!val || !String(val).trim()) {
      errors.push(`  MISSING: ${key}`)
    } else if (isUnsafe(val)) {
      errors.push(`  UNSAFE:  ${key} (looks like a placeholder value)`)
    }
  }

  if (errors.length === 0) {
    console.log("[config] production config validated OK")
    return
  }

  console.error("[config] FATAL: production config validation failed:")
  for (const e of errors) console.error(e)
  process.exit(1)
}

module.exports = { validateProductionConfig }
