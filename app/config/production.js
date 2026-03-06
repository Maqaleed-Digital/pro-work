"use strict"

/**
 * S34: ProWork Production Configuration
 * Reads environment variables and provides typed defaults.
 * Loaded by server.js; individual values can be overridden per deployment.
 */

const pkg = (() => {
  try { return require("../package.json") } catch { return {} }
})()

module.exports = {
  // ── server ──────────────────────────────────────────────────────────────
  port:          Number(process.env.APP_PORT  || "3010"),
  host:          process.env.APP_HOST         || "127.0.0.1",
  // In production set APP_HOST=0.0.0.0 to bind all interfaces
  tlsEnabled:    process.env.TLS_ENABLED      === "true",

  // ── observability ───────────────────────────────────────────────────────
  logLevel:      process.env.LOG_LEVEL        || "info",
  gitCommit:     process.env.GIT_COMMIT       || "unknown",

  // ── WOS ─────────────────────────────────────────────────────────────────
  wosPublicWrite:      process.env.WOS_PUBLIC_WRITE      === "true",
  schedulerIntervalMs: Number(process.env.SCHEDULER_INTERVAL_MS || "30000"),

  // ── export / snapshots ──────────────────────────────────────────────────
  maxExportTenants:        50,
  analyticsSnapshotMax:    100,

  // ── CORS ────────────────────────────────────────────────────────────────
  corsOrigins: (process.env.CORS_ORIGINS || "").split(",").filter(Boolean),

  // ── meta ────────────────────────────────────────────────────────────────
  appName:    pkg.name    || "pro-work-app",
  appVersion: pkg.version || "0.0.0",
}
