"use strict"

const LOG_LEVEL = process.env.LOG_LEVEL || "info"
const LOG_FORMAT = process.env.LOG_FORMAT || "json"
const SERVICE_NAME = process.env.SERVICE_NAME || "prowork-api"
const ENVIRONMENT = process.env.NODE_ENV || "development"

const LEVELS = { error: 0, warn: 1, info: 2, http: 3, debug: 4, trace: 5 }
const currentLevel = LEVELS[LOG_LEVEL] ?? LEVELS.info

function shouldLog(level) {
  return LEVELS[level] <= currentLevel
}

function formatTimestamp() {
  return new Date().toISOString()
}

function formatLog(level, message, context = {}) {
  const entry = {
    timestamp: formatTimestamp(),
    level,
    service: SERVICE_NAME,
    environment: ENVIRONMENT,
    message,
    ...context
  }

  if (LOG_FORMAT === "text") {
    const ctx = Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : ""
    return `[${entry.timestamp}] ${level.toUpperCase().padEnd(5)} ${message}${ctx}`
  }

  return JSON.stringify(entry)
}

function log(level, message, context = {}) {
  if (!shouldLog(level)) return
  const output = formatLog(level, message, context)
  if (level === "error") console.error(output)
  else if (level === "warn") console.warn(output)
  else console.log(output)
}

const error = (msg, ctx) => log("error", msg, ctx)
const warn = (msg, ctx) => log("warn", msg, ctx)
const info = (msg, ctx) => log("info", msg, ctx)
const http = (msg, ctx) => log("http", msg, ctx)
const debug = (msg, ctx) => log("debug", msg, ctx)
const trace = (msg, ctx) => log("trace", msg, ctx)

function logRequest(req, res, duration) {
  http("HTTP Request", {
    method: req.method,
    url: req.url,
    status: res.statusCode,
    duration_ms: duration,
    user_agent: req.headers["user-agent"],
    ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress,
    request_id: req.headers["x-request-id"],
    tenant_id: req.headers["x-tenant-id"]
  })
}

function logError(err, context = {}) {
  error(err.message || "Unknown error", {
    ...context,
    error_name: err.name,
    error_code: err.code,
    stack: err.stack?.split("\n").slice(0, 10)
  })
}

const metrics = {
  counters: new Map(),
  gauges: new Map(),
  histograms: new Map()
}

function incrementCounter(name, value = 1, labels = {}) {
  const key = `${name}:${JSON.stringify(labels)}`
  const current = metrics.counters.get(key) || 0
  metrics.counters.set(key, current + value)
}

function setGauge(name, value, labels = {}) {
  const key = `${name}:${JSON.stringify(labels)}`
  metrics.gauges.set(key, value)
}

function recordHistogram(name, value, labels = {}) {
  const key = `${name}:${JSON.stringify(labels)}`
  const bucket = metrics.histograms.get(key) || []
  bucket.push({ value, timestamp: Date.now() })
  if (bucket.length > 1000) bucket.shift()
  metrics.histograms.set(key, bucket)
}

function getMetrics() {
  const output = {
    counters: Object.fromEntries(metrics.counters),
    gauges: Object.fromEntries(metrics.gauges),
    histograms: {}
  }

  for (const [key, values] of metrics.histograms) {
    if (values.length > 0) {
      const sorted = values.map(v => v.value).sort((a, b) => a - b)
      output.histograms[key] = {
        count: values.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)]
      }
    }
  }

  return output
}

function getPrometheusMetrics() {
  let output = ""

  for (const [key, value] of metrics.counters) {
    const colonIndex = key.indexOf(":")
    const name = colonIndex > 0 ? key.slice(0, colonIndex) : key
    const labelsJson = colonIndex > 0 ? key.slice(colonIndex + 1) : "{}"
    try {
      const labels = JSON.parse(labelsJson || "{}")
      const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(",")
      output += `${name}{${labelStr}} ${value}\n`
    } catch {
      output += `${name} ${value}\n`
    }
  }

  for (const [key, value] of metrics.gauges) {
    const colonIndex = key.indexOf(":")
    const name = colonIndex > 0 ? key.slice(0, colonIndex) : key
    const labelsJson = colonIndex > 0 ? key.slice(colonIndex + 1) : "{}"
    try {
      const labels = JSON.parse(labelsJson || "{}")
      const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(",")
      output += `${name}{${labelStr}} ${value}\n`
    } catch {
      output += `${name} ${value}\n`
    }
  }

  return output
}

function child(context) {
  return {
    error: (msg, ctx) => error(msg, { ...context, ...ctx }),
    warn: (msg, ctx) => warn(msg, { ...context, ...ctx }),
    info: (msg, ctx) => info(msg, { ...context, ...ctx }),
    http: (msg, ctx) => http(msg, { ...context, ...ctx }),
    debug: (msg, ctx) => debug(msg, { ...context, ...ctx }),
    trace: (msg, ctx) => trace(msg, { ...context, ...ctx }),
    child: (moreContext) => child({ ...context, ...moreContext })
  }
}

module.exports = {
  error,
  warn,
  info,
  http,
  debug,
  trace,
  logRequest,
  logError,
  incrementCounter,
  setGauge,
  recordHistogram,
  getMetrics,
  getPrometheusMetrics,
  child
}
