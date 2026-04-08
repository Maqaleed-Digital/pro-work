"use strict"

const http = require("http")
const { URL } = require("url")
const crypto = require("crypto")
const path = require("path")
const fs = require("fs")
const Admin = require("./lib/admin")
const AdminPerms = require("./lib/admin_permissions")
const Logger            = require("./lib/logging/logger")
const AuthzAudit        = require("./lib/authz_audit")
const ApprovalControl   = require("./lib/approval_control")
const SovereignRegistry    = require("./lib/sovereign_registry")
const TenantJurisdiction   = require("./lib/tenant_jurisdiction")
const EvidenceGovernance   = require("./lib/evidence_governance")
const DisclosureLegalHold  = require("./lib/disclosure_legal_hold")
const Scheduler      = require("./scheduler")
const Analytics      = require("./analytics")
const SchedulerJobs  = require("./wos/scheduler_jobs")
const ProductionConfig = require("./config/production")
const { buildZip }   = require("./lib/zip")
const { validateProductionConfig } = require("./config/validate")
const { getDataDir, getAppDataDir } = require("./lib/data_paths")

validateProductionConfig()

const UI_DIST = path.join(__dirname, "frontend", "dist")

const HOST = process.env.APP_HOST || "127.0.0.1"
const PORT = Number(process.env.APP_PORT || "3010")
// S30: when false (default), WOS write endpoints (POST/PATCH) require Bearer auth
const WOS_PUBLIC_WRITE = process.env.WOS_PUBLIC_WRITE === "true"

// S35: security middleware
const TRUSTED_PROXY = process.env.TRUSTED_PROXY === "1" || process.env.TRUSTED_PROXY === "true"
const BODY_LIMIT    = 512 * 1024  // 512 KiB
const _CORS_ORIGINS = new Set(
  (process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGINS || "").split(",").filter(Boolean)
)
const _RL_WINDOW_MS = 60_000
const _RL_ADMIN_MAX = 120   // req/min on /api/admin/*
const _RL_WRITE_MAX = 60    // req/min on public write methods
const _rateCounts   = new Map()  // ip → { ts, count }

const BOOT_ID = crypto.randomUUID()
const STARTED_AT_ISO = nowIso()
const PID = process.pid

/* S27 */
const SYSTEM_VERSION = "S27"
const BUILD_COMMIT = process.env.GIT_COMMIT || "unknown"

function bootMeta() {
  return {
    boot_id: BOOT_ID,
    started_at: STARTED_AT_ISO,
    pid: PID
  }
}

function nowIso() {
  return new Date().toISOString()
}

function ok(res, data, statusCode = 200) {
  const body = JSON.stringify({ ok: true, data })
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  })
  res.end(body)
}

function fail(res, code, message, statusCode = 400) {
  const body = JSON.stringify({ ok: false, error: { code, message } })
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  })
  res.end(body)
}

function failFromAdmin(res, adminErr) {
  const status = Number(adminErr && adminErr.status ? adminErr.status : 500)
  const e = adminErr && adminErr.error ? adminErr.error : { code: "ADMIN_ERROR", message: "admin error" }
  fail(res, e.code || "ADMIN_ERROR", e.message || "admin error", status)
}


// Phase 12: audit context shape = { correlation_id, request_id, route, method, decision_type }
function requireAdminPerm(res, principal, perm, auditCtx) {
  const decision = AdminPerms.checkPerm(principal, perm)
  Logger.info("permission.decision", {
    actor:          decision.actor,
    role:           decision.role,
    permission:     decision.permission,
    decision:       decision.decision,
    correlation_id: auditCtx ? auditCtx.correlation_id : undefined,
    request_id:     auditCtx ? auditCtx.request_id     : undefined,
  })
  // Phase 12: append immutable audit record for captured privileged decisions
  if (auditCtx) {
    const outcome = decision.allowed ? AuthzAudit.OUTCOMES.ALLOW : AuthzAudit.OUTCOMES.DENY
    AuthzAudit.appendRecord(AuthzAudit.createRecord({
      correlation_id:      auditCtx.correlation_id,
      request_id:          auditCtx.request_id,
      route:               auditCtx.route   || "(unknown)",
      method:              auditCtx.method  || "(unknown)",
      actor_id:            decision.actor,
      resolved_role:       decision.role,
      relevant_permission: perm,
      decision_type:       auditCtx.decision_type || (decision.allowed ? AuthzAudit.DECISION_TYPES.PERM_ALLOWED : AuthzAudit.DECISION_TYPES.PERM_DENIED),
      decision_outcome:    outcome,
      status_code:         decision.allowed ? 200 : 403,
      reason_code:         decision.allowed ? "permission_granted" : `missing_permission:${perm}`,
    }))
  }
  if (decision.allowed) return true
  return failFromAdmin(res, AdminPerms.deny(perm))
}

// Phase 14: resolve sovereign control, log decision, return false and send 403 if not active
function requireSovereignControl(res, key, correlationId) {
  const check = SovereignRegistry.resolveControl(key)
  Logger.info("sovereign.control.resolved", {
    control_key:     check.control_key,
    control_version: check.control_version,
    ok:              check.ok,
    reason:          check.reason || "active",
    correlation_id:  correlationId,
  })
  if (check.ok) return check
  fail(res, "POLICY_CONTROL_MISSING", `sovereign control not active: ${key} (${check.reason})`, 403)
  return null
}

// Phase 15: resolve tenant governance context — fail closed if unknown/inactive or cross-tenant mismatch
function requireTenantGovernance(res, principalTenantId, requestTenantId, correlationId) {
  // Cross-tenant check first
  const crossCheck = TenantJurisdiction.validateCrossTenant(principalTenantId, requestTenantId)
  if (!crossCheck.ok) {
    Logger.info("tenant.governance.cross_tenant_denied", {
      principal_tenant: principalTenantId, request_tenant: requestTenantId,
      reason: crossCheck.reason, correlation_id: correlationId,
    })
    fail(res, "TENANT_FORBIDDEN", `cross-tenant privileged action denied: ${crossCheck.reason}`, 403)
    return null
  }
  // Resolve tenant governance
  const tgCheck = TenantJurisdiction.resolveTenantGovernance(requestTenantId, tenantRegistry)
  Logger.info("tenant.governance.resolved", {
    tenant_id: requestTenantId, ok: tgCheck.ok,
    reason: tgCheck.reason || "active", jurisdiction_code: tgCheck.jurisdiction_code || null,
    correlation_id: correlationId,
  })
  if (!tgCheck.ok) {
    fail(res, "TENANT_GOVERNANCE_DENIED", `tenant governance check failed: ${tgCheck.reason}`, 403)
    return null
  }
  return tgCheck
}

// Phase 15: resolve jurisdiction governance context — fail closed if unknown/inactive or incompatible
function requireJurisdictionGovernance(res, jurisdictionCode, tenantJurisdiction, correlationId) {
  const jCheck = TenantJurisdiction.resolveJurisdiction(jurisdictionCode)
  Logger.info("jurisdiction.governance.resolved", {
    jurisdiction_code: jurisdictionCode, ok: jCheck.ok,
    reason: jCheck.reason || "active", correlation_id: correlationId,
  })
  if (!jCheck.ok) {
    fail(res, "JURISDICTION_DENIED", `jurisdiction check failed: ${jCheck.reason}`, 403)
    return null
  }
  const compatCheck = TenantJurisdiction.validateJurisdictionCompatibility(jurisdictionCode, tenantJurisdiction)
  if (!compatCheck.ok) {
    Logger.info("jurisdiction.governance.incompatible", {
      jurisdiction_code: jurisdictionCode, tenant_jurisdiction: tenantJurisdiction,
      reason: compatCheck.reason, correlation_id: correlationId,
    })
    fail(res, "JURISDICTION_INCOMPATIBLE", `jurisdiction incompatible: ${compatCheck.reason}`, 403)
    return null
  }
  return jCheck
}

// Phase 16: resolve residency context — fail closed if unknown/inactive or incompatible with jurisdiction
function requireResidencyGovernance(res, residencyRegion, jurisdictionCode, correlationId) {
  const rCheck = EvidenceGovernance.resolveResidency(residencyRegion)
  Logger.info("residency.governance.resolved", {
    residency_region: residencyRegion, ok: rCheck.ok,
    reason: rCheck.reason || "active", correlation_id: correlationId,
  })
  if (!rCheck.ok) {
    fail(res, "RESIDENCY_DENIED", `residency check failed: ${rCheck.reason}`, 403)
    return null
  }
  const compatCheck = EvidenceGovernance.validateResidencyCompatibility(residencyRegion, jurisdictionCode)
  if (!compatCheck.ok) {
    Logger.info("residency.governance.incompatible", {
      residency_region: residencyRegion, jurisdiction_code: jurisdictionCode,
      reason: compatCheck.reason, correlation_id: correlationId,
    })
    fail(res, "RESIDENCY_INCOMPATIBLE", `residency incompatible with jurisdiction: ${compatCheck.reason}`, 403)
    return null
  }
  return rCheck
}

// Phase 16: resolve retention context — fail closed if unknown or inactive
function requireRetentionGovernance(res, retentionClass, correlationId) {
  const rcCheck = EvidenceGovernance.resolveRetention(retentionClass)
  Logger.info("retention.governance.resolved", {
    retention_class: retentionClass, ok: rcCheck.ok,
    reason: rcCheck.reason || "active", correlation_id: correlationId,
  })
  if (!rcCheck.ok) {
    fail(res, "RETENTION_DENIED", `retention check failed: ${rcCheck.reason}`, 403)
    return null
  }
  return rcCheck
}

// Phase 17: resolve disclosure basis + scope — fail closed if unknown/inactive or out of scope
function requireDisclosureGovernance(res, basis, scope, correlationId) {
  const bCheck = DisclosureLegalHold.resolveDisclosureBasis(basis)
  Logger.info("disclosure.governance.resolved", {
    disclosure_basis: basis, ok: bCheck.ok,
    reason: bCheck.reason || "active", correlation_id: correlationId,
  })
  if (!bCheck.ok) {
    fail(res, "DISCLOSURE_DENIED", `disclosure basis check failed: ${bCheck.reason}`, 403)
    return null
  }
  const sCheck = DisclosureLegalHold.validateDisclosureScope(basis, scope)
  Logger.info("disclosure.scope.resolved", {
    disclosure_basis: basis, disclosure_scope: scope, ok: sCheck.ok,
    reason: sCheck.reason || "in_scope", correlation_id: correlationId,
  })
  if (!sCheck.ok) {
    fail(res, "DISCLOSURE_SCOPE_DENIED", `disclosure scope check failed: ${sCheck.reason}`, 403)
    return null
  }
  return { basis: bCheck.entry, scope: sCheck.scope }
}

// Phase 17: check for active legal hold — block disposal/lifecycle if hold active
function requireLegalHoldClear(res, tenantId, correlationId) {
  const active = DisclosureLegalHold.hasActiveLegalHold(tenantId)
  Logger.info("legal.hold.checked", {
    tenant_id: tenantId, active_hold: active, correlation_id: correlationId,
  })
  if (active) {
    fail(res, "LEGAL_HOLD_ACTIVE", "active legal hold blocks disposal action", 403)
    return false
  }
  return true
}

// Phase 12: authenticate and write audit deny record on auth failure for audited routes
function authenticateAndAudit(req, auditCtx) {
  const ap = Admin.authenticate(req)
  if (!ap.ok && auditCtx) {
    AuthzAudit.appendRecord(AuthzAudit.createRecord({
      correlation_id:      auditCtx.correlation_id,
      request_id:          auditCtx.request_id,
      route:               auditCtx.route  || "(unknown)",
      method:              auditCtx.method || "(unknown)",
      actor_id:            "(unauthenticated)",
      resolved_role:       "(none)",
      relevant_permission: auditCtx.perm  || "(none)",
      decision_type:       AuthzAudit.DECISION_TYPES.PERM_DENIED,
      decision_outcome:    AuthzAudit.OUTCOMES.DENY,
      status_code:         401,
      reason_code:         "authentication_failed",
    }))
  }
  return ap
}

// S30: tenant-scoped principal access check
function requireTenantAccess(res, principal, tenantId) {
  const pt = String((principal && principal.tenant_id) || "default").trim()
  if (pt === "*") return true
  if (pt !== tenantId) {
    fail(res, "FORBIDDEN", `principal does not have access to tenant "${tenantId}"`, 403)
    return false
  }
  return true
}


// S35: security middleware helpers ──────────────────────────────────────────

function clientIp(req) {
  if (TRUSTED_PROXY) {
    const xff = req.headers["x-forwarded-for"]
    if (xff) return String(xff).split(",")[0].trim()
  }
  return (req.socket && req.socket.remoteAddress) || "unknown"
}

function setSecureHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("X-XSS-Protection", "0")
  res.setHeader("Referrer-Policy", "no-referrer")
  res.setHeader("Permissions-Policy", "interest-cohort=()")
}

function applyCors(req, res) {
  const origin = String(req.headers["origin"] || "").trim()
  if (!origin) return true
  if (_CORS_ORIGINS.size > 0 && !_CORS_ORIGINS.has(origin)) {
    res.writeHead(403, { "content-type": "application/json; charset=utf-8" })
    res.end(JSON.stringify({ ok: false, error: { code: "CORS_DENIED", message: "Origin not allowed" } }))
    return false
  }
  res.setHeader("Access-Control-Allow-Origin", origin)
  res.setHeader("Vary", "Origin")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Tenant-Id")
  res.setHeader("Access-Control-Max-Age", "600")
  return true
}

function checkRateLimit(req, res, max) {
  const ip  = clientIp(req)
  const now = Date.now()
  let e = _rateCounts.get(ip)
  if (!e || now - e.ts > _RL_WINDOW_MS) { e = { ts: now, count: 0 }; _rateCounts.set(ip, e) }
  e.count++
  if (e.count > max) {
    const retryAfter = String(Math.ceil((e.ts + _RL_WINDOW_MS - now) / 1000))
    res.writeHead(429, { "content-type": "application/json; charset=utf-8", "retry-after": retryAfter })
    res.end(JSON.stringify({ ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } }))
    return false
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────────

async function readJson(req, res) {
  const ct = String(req.headers["content-type"] || "").toLowerCase()
  if (!ct.includes("application/json")) {
    fail(res, "UNSUPPORTED_MEDIA_TYPE", "content-type must be application/json", 415)
    return null
  }

  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > BODY_LIMIT) {
      fail(res, "PAYLOAD_TOO_LARGE", `body exceeds ${BODY_LIMIT} byte limit`, 413)
      return null
    }
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim()
  if (!raw) {
    fail(res, "VALIDATION_ERROR", "body: JSON required", 422)
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    fail(res, "VALIDATION_ERROR", "body: invalid JSON", 422)
    return null
  }
}

function validateRequired(res, path, value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    fail(res, "VALIDATION_ERROR", `${path}: Field required`, 422)
    return false
  }
  return true
}

function validateNumber(res, path, value) {
  const n = Number(value)
  if (!Number.isFinite(n)) {
    fail(res, "VALIDATION_ERROR", `${path}: Must be a number`, 422)
    return null
  }
  return n
}

function genId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`
}

const store = {
  jobs: new Map(),
  proposalsByJob: new Map(),
  proposals: new Map(),
  contractIntents: new Map(),
  tenants: new Map()
}

/* S29: tenant-scoped WOS store */
function getTenantStore(tenantId) {
  if (!store.tenants.has(tenantId)) {
    store.tenants.set(tenantId, {
      wosWorkers: new Map(),
      wosPods: new Map(),
      wosAssignments: new Map(),
      wosEvidenceEvents: []
    })
  }
  return store.tenants.get(tenantId)
}

/* =========================================================
S29-PERSISTENCE: per-tenant JSON file storage
data/tenants/<tenantId>/{workers,pods,assignments,evidence}.json
========================================================= */

const DATA_DIR = getDataDir()

function tenantDataDir(tenantId) {
  return path.join(DATA_DIR, "tenants", tenantId)
}

const _persistTimers = {}

function schedulePersist(tenantId) {
  if (_persistTimers[tenantId]) clearTimeout(_persistTimers[tenantId])
  _persistTimers[tenantId] = setTimeout(() => {
    delete _persistTimers[tenantId]
    try { saveTenantStore(tenantId) } catch (e) {
      console.error("[persist] save failed for tenant", tenantId, e && e.message)
    }
  }, 2000)
}

function saveTenantStore(tenantId) {
  const dir = tenantDataDir(tenantId)
  fs.mkdirSync(dir, { recursive: true })
  const t = getTenantStore(tenantId)
  fs.writeFileSync(path.join(dir, "workers.json"),     JSON.stringify(Array.from(t.wosWorkers.entries()),    null, 2))
  fs.writeFileSync(path.join(dir, "pods.json"),        JSON.stringify(Array.from(t.wosPods.entries()),       null, 2))
  fs.writeFileSync(path.join(dir, "assignments.json"), JSON.stringify(Array.from(t.wosAssignments.entries()), null, 2))
  fs.writeFileSync(path.join(dir, "evidence.json"),    JSON.stringify(t.wosEvidenceEvents,                   null, 2))
}

function loadAllTenants() {
  const tenantsDir = path.join(DATA_DIR, "tenants")
  if (!fs.existsSync(tenantsDir)) return
  let dirs
  try { dirs = fs.readdirSync(tenantsDir) } catch { return }
  for (const tid of dirs) {
    const dir = path.join(tenantsDir, tid)
    try { if (!fs.statSync(dir).isDirectory()) continue } catch { continue }
    const t = getTenantStore(tid)
    const tryLoad = (file) => {
      try {
        const p = path.join(dir, file)
        if (!fs.existsSync(p)) return null
        return JSON.parse(fs.readFileSync(p, "utf8"))
      } catch { return null }
    }
    const workers = tryLoad("workers.json")
    if (Array.isArray(workers)) for (const [id, w] of workers) t.wosWorkers.set(id, w)
    const pods = tryLoad("pods.json")
    if (Array.isArray(pods)) for (const [id, p] of pods) t.wosPods.set(id, p)
    const assignments = tryLoad("assignments.json")
    if (Array.isArray(assignments)) for (const [id, a] of assignments) t.wosAssignments.set(id, a)
    const evidence = tryLoad("evidence.json")
    if (Array.isArray(evidence)) t.wosEvidenceEvents.push(...evidence)
    console.log(`[persist] loaded tenant "${tid}": ${t.wosWorkers.size} workers, ${t.wosAssignments.size} assignments, ${t.wosEvidenceEvents.length} events`)
  }
}

// S30: tenant registry ──────────────────────────────────────────────────────
const TENANT_REGISTRY_PATH = path.join(getAppDataDir(), "tenants.json")
let tenantRegistry = {}  // { [tenantId]: { tenant_id, name, status, created_at, notes } }
const TENANT_ID_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/

function normalizeTenantId(raw) {
  return String(raw || "").trim().toLowerCase()
}

function assertValidTenantId(res, tid) {
  if (!tid) { fail(res, "VALIDATION_ERROR", "body.tenant_id: Field required", 422); return false }
  if (tid === "*" || tid.includes("/") || tid.includes("\\") || tid.includes("..")) {
    fail(res, "VALIDATION_ERROR", `body.tenant_id: Invalid tenant_id "${tid}"`, 422); return false
  }
  if (!TENANT_ID_RE.test(tid)) {
    fail(res, "VALIDATION_ERROR", "body.tenant_id: Must match ^[a-z0-9][a-z0-9_-]{1,31}$", 422); return false
  }
  return true
}

function saveTenantRegistry() {
  try {
    fs.mkdirSync(path.dirname(TENANT_REGISTRY_PATH), { recursive: true })
    fs.writeFileSync(TENANT_REGISTRY_PATH,
      JSON.stringify({ tenants: tenantRegistry }, null, 2) + "\n", "utf8")
  } catch (e) { console.error("[registry] save failed", e && e.message) }
}

function loadTenantRegistry() {
  try {
    const raw = fs.readFileSync(TENANT_REGISTRY_PATH, "utf8")
    const parsed = JSON.parse(raw)
    tenantRegistry = (parsed && typeof parsed.tenants === "object" && !Array.isArray(parsed.tenants))
      ? parsed.tenants : {}
  } catch { tenantRegistry = {} }
  // seed "default" if missing
  if (!tenantRegistry["default"]) {
    tenantRegistry["default"] = { tenant_id: "default", name: "Default",
      status: "active", created_at: new Date().toISOString(), notes: "" }
  }
  // S30 migration: auto-register any tenants already loaded from data/tenants/
  let migrated = 0
  for (const tid of store.tenants.keys()) {
    if (!tenantRegistry[tid]) {
      tenantRegistry[tid] = { tenant_id: tid, name: tid, status: "active",
        created_at: new Date().toISOString(), notes: "auto-registered from existing data" }
      migrated++
    }
  }
  saveTenantRegistry()
  console.log(`[registry] loaded ${Object.keys(tenantRegistry).length} tenant(s)${migrated ? ` (${migrated} auto-registered)` : ""}`)
}

function isTenantActive(tenantId) {
  const e = tenantRegistry[tenantId]
  return !!e && String(e.status || "active") === "active"
}

function requireTenantActive(res, tenantId) {
  const e = tenantRegistry[tenantId]
  if (!e) { fail(res, "TENANT_NOT_FOUND", `tenant "${tenantId}" is not registered`, 404); return false }
  if (!isTenantActive(tenantId)) { fail(res, "TENANT_DISABLED", `tenant "${tenantId}" is disabled`, 403); return false }
  return true
}
// ────────────────────────────────────────────────────────────────────────────

function resolveTenantId(req) {
  const header = req.headers["x-tenant-id"]
  if (header && header.trim()) return header.trim()

  const url = new URL(req.url, "http://localhost")
  const queryTenant = url.searchParams.get("tenant_id")
  if (queryTenant && queryTenant.trim()) return queryTenant.trim()

  return "default"
}

function createJob(input) {
  const id = genId("job")
  const t = nowIso()
  const job = {
    id,
    title: String(input.title),
    description: String(input.description),
    budget: Number(input.budget),
    status: "open",
    created_at: t,
    updated_at: t
  }
  store.jobs.set(id, job)
  if (!store.proposalsByJob.has(id)) store.proposalsByJob.set(id, [])
  return job
}

function listJobs() {
  return Array.from(store.jobs.values())
}

function getJob(id) {
  return store.jobs.get(id) || null
}

function updateJob(job, patch) {
  const t = nowIso()
  const next = { ...job, ...patch, updated_at: t }
  store.jobs.set(next.id, next)
  return next
}

function createProposal(jobId, input) {
  const id = genId("proposal")
  const t = nowIso()
  const proposal = {
    id,
    job_id: jobId,
    freelancer_name: String(input.freelancer_name),
    price: Number(input.price),
    message: String(input.message),
    status: "pending",
    created_at: t,
    updated_at: t
  }
  store.proposals.set(id, proposal)
  const list = store.proposalsByJob.get(jobId) || []
  list.push(proposal)
  store.proposalsByJob.set(jobId, list)
  return proposal
}

function listProposals(jobId) {
  return store.proposalsByJob.get(jobId) || []
}

function getProposal(id) {
  return store.proposals.get(id) || null
}

function updateProposal(proposal, patch) {
  const t = nowIso()
  const next = { ...proposal, ...patch, updated_at: t }
  store.proposals.set(next.id, next)
  const list = store.proposalsByJob.get(next.job_id) || []
  const idx = list.findIndex(p => p.id === next.id)
  if (idx >= 0) list[idx] = next
  store.proposalsByJob.set(next.job_id, list)
  return next
}

function createContractIntent(input) {
  const id = genId("contract_intent")
  const t = nowIso()
  const ci = {
    id,
    job_id: String(input.job_id),
    proposal_id: String(input.proposal_id),
    buyer_name: String(input.buyer_name),
    terms_summary: String(input.terms_summary),
    status: "draft",
    created_at: t,
    updated_at: t
  }
  store.contractIntents.set(id, ci)
  return ci
}

function getContractIntent(id) {
  return store.contractIntents.get(id) || null
}

function updateContractIntent(ci, patch) {
  const t = nowIso()
  const next = { ...ci, ...patch, updated_at: t }
  store.contractIntents.set(next.id, next)
  return next
}

function normalizeLimit(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 50
  const i = Math.floor(n)
  if (i <= 0) return 50
  if (i > 200) return 200
  return i
}

function listContractIntents(query) {
  const allowed = new Set(["job_id", "proposal_id", "status", "limit", "cursor"])
  for (const k of query.keys()) {
    if (!allowed.has(k)) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: `query.${k}: Unsupported query param` }, status: 422 }
    }
  }

  const jobId = query.get("job_id")
  const proposalId = query.get("proposal_id")
  const status = query.get("status")
  const limit = normalizeLimit(query.get("limit"))
  const cursor = query.get("cursor")

  let items = Array.from(store.contractIntents.values())

  if (jobId && String(jobId).trim() !== "") {
    items = items.filter(x => String(x.job_id) === String(jobId))
  }
  if (proposalId && String(proposalId).trim() !== "") {
    items = items.filter(x => String(x.proposal_id) === String(proposalId))
  }
  if (status && String(status).trim() !== "") {
    items = items.filter(x => String(x.status) === String(status))
  }

  items.sort((a, b) => {
    const aa = String(a.created_at || "")
    const bb = String(b.created_at || "")
    if (aa === bb) return 0
    return aa > bb ? -1 : 1
  })

  if (cursor && String(cursor).trim() !== "") {
    items = items.filter(x => String(x.created_at || "") < String(cursor))
  }

  return { ok: true, data: items.slice(0, limit) }
}

function allowedNextStates(status) {
  const s = String(status || "")
  if (s === "draft") return ["sent"]
  if (s === "sent") return ["accepted"]
  if (s === "accepted") return []
  return []
}

function isKnownContractIntentState(status) {
  const s = String(status || "")
  return s === "draft" || s === "sent" || s === "accepted"
}

function buildContractIntentAudit(ci) {
  const proposal = getProposal(ci.proposal_id)
  const job = getJob(ci.job_id)

  const knownState = isKnownContractIntentState(ci.status)

  const invariants = []

  const ruleProposalAcceptedRequired = String(ci.status) === "sent" || String(ci.status) === "accepted"

  invariants.push({
    rule: "proposal.exists",
    ok: Boolean(proposal),
    details: proposal ? null : "proposal not found"
  })

  invariants.push({
    rule: "job.exists",
    ok: Boolean(job),
    details: job ? null : "job not found"
  })

  invariants.push({
    rule: "contract_intent.state.known",
    ok: knownState,
    details: knownState ? null : `unknown state '${String(ci.status)}'`
  })

  if (ruleProposalAcceptedRequired) {
    invariants.push({
      rule: "proposal.accepted_required_for_state",
      ok: Boolean(proposal && proposal.status === "accepted"),
      details: proposal ? `proposal.status='${proposal.status}'` : "proposal missing"
    })
  } else {
    invariants.push({
      rule: "proposal.accepted_required_for_state",
      ok: true,
      details: "not required for draft"
    })
  }

  if (String(ci.status) === "sent" || String(ci.status) === "accepted") {
    const okJob = Boolean(job && (job.status === "in_progress" || job.status === "completed"))
    invariants.push({
      rule: "job.status_aligned_for_state",
      ok: okJob,
      details: job ? `job.status='${job.status}'` : "job missing"
    })
  } else {
    invariants.push({
      rule: "job.status_aligned_for_state",
      ok: true,
      details: "not required for draft"
    })
  }

  return {
    id: ci.id,
    current_state: String(ci.status),
    allowed_next_states: allowedNextStates(ci.status),
    invariants,
    last_updated_at: ci.updated_at || ci.created_at || null
  }
}

function isWorkerType(v) {
  return v === "FTE" || v === "FREELANCER"
}

function emitWosEvidenceEvent(tenantId, input) {
  const tenant = getTenantStore(tenantId)
  const id = genId("ev")
  const evt = {
    id,
    tenant_id: tenantId,
    actor: String(input.actor || "system"),
    action: String(input.action),
    entity_type: String(input.entity_type),
    entity_id: String(input.entity_id),
    timestamp: nowIso(),
    snapshot: input.snapshot === undefined ? null : input.snapshot
  }
  tenant.wosEvidenceEvents.push(evt)
  schedulePersist(tenantId)
  return evt
}

function listWosEvidenceEventsQuery(tenantId, query) {
  const allowed = new Set(["entity_id", "entity_type", "action", "actor", "limit", "cursor", "tenant_id"])
  for (const k of query.keys()) {
    if (!allowed.has(k)) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: `query.${k}: Unsupported query param` }, status: 422 }
    }
  }

  const entityId = query.get("entity_id")
  const entityType = query.get("entity_type")
  const action = query.get("action")
  const actor = query.get("actor")
  const limit = normalizeLimit(query.get("limit"))
  const cursor = query.get("cursor")

  const tenant = getTenantStore(tenantId)
  let items = tenant.wosEvidenceEvents.slice()

  if (entityId && String(entityId).trim() !== "") items = items.filter(e => String(e.entity_id) === String(entityId))
  if (entityType && String(entityType).trim() !== "") items = items.filter(e => String(e.entity_type) === String(entityType))
  if (action && String(action).trim() !== "") items = items.filter(e => String(e.action) === String(action))
  if (actor && String(actor).trim() !== "") items = items.filter(e => String(e.actor) === String(actor))

  items.sort((a, b) => {
    const aa = String(a.timestamp || "")
    const bb = String(b.timestamp || "")
    if (aa === bb) return 0
    return aa > bb ? -1 : 1
  })

  if (cursor && String(cursor).trim() !== "") items = items.filter(e => String(e.timestamp || "") < String(cursor))

  const page = items.slice(0, limit)
  const nextCursor = page.length > 0 ? String(page[page.length - 1].timestamp || "") : ""
  const hasMore = items.length > page.length

  return {
    ok: true,
    data: {
      items: page,
      next_cursor: hasMore && nextCursor ? nextCursor : null
    }
  }
}

function actorFromReq(req) {
  const h = req.headers["x-actor"]
  const actor = h === undefined || h === null ? "" : String(h).trim()
  return actor || "user"
}

function createWosWorker(tenantId, input, actor) {
  const type = String(input.type || "").trim()
  if (!isWorkerType(type)) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.type: Must be 'FTE' or 'FREELANCER'" }, status: 422 }
  }

  const displayName = String(input.display_name || "").trim()
  if (!displayName) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.display_name: Field required" }, status: 422 }
  }

  const email = input.email === undefined || input.email === null ? null : String(input.email).trim()
  if (email !== null && email === "") {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.email: Must be a non-empty string or null" }, status: 422 }
  }

  const id = genId("wkr")
  const t = nowIso()
  const worker = {
    id,
    type,
    display_name: displayName,
    email,
    skills: Array.isArray(input.skills) ? input.skills.map(x => String(x)).filter(Boolean) : [],
    availability: typeof input.availability === "object" && input.availability !== null && !Array.isArray(input.availability) ? input.availability : {},
    status: String(input.status || "active"),
    created_at: t,
    updated_at: t
  }

  const tenant = getTenantStore(tenantId)
  tenant.wosWorkers.set(id, worker)
  schedulePersist(tenantId)

  emitWosEvidenceEvent(tenantId, {
    actor,
    action: "wos.worker.create",
    entity_type: "wos.worker",
    entity_id: id,
    snapshot: worker
  })

  return { ok: true, data: worker }
}

function getWosWorker(tenantId, id) {
  return getTenantStore(tenantId).wosWorkers.get(id) || null
}

function listWosWorkersQuery(tenantId, query) {
  const allowed = new Set(["type", "status", "skill", "limit", "cursor", "tenant_id"])
  for (const k of query.keys()) {
    if (!allowed.has(k)) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: `query.${k}: Unsupported query param` }, status: 422 }
    }
  }

  const type = query.get("type")
  const status = query.get("status")
  const skill = query.get("skill")
  const limit = normalizeLimit(query.get("limit"))
  const cursor = query.get("cursor")

  if (type && String(type).trim() !== "" && !isWorkerType(String(type))) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "query.type: Must be 'FTE' or 'FREELANCER'" }, status: 422 }
  }

  const tenant = getTenantStore(tenantId)
  let items = Array.from(tenant.wosWorkers.values())

  if (type && String(type).trim() !== "") items = items.filter(w => String(w.type) === String(type))
  if (status && String(status).trim() !== "") items = items.filter(w => String(w.status) === String(status))
  if (skill && String(skill).trim() !== "") items = items.filter(w => Array.isArray(w.skills) && w.skills.includes(String(skill)))

  items.sort((a, b) => {
    const aa = String(a.created_at || "")
    const bb = String(b.created_at || "")
    if (aa === bb) return 0
    return aa > bb ? -1 : 1
  })

  if (cursor && String(cursor).trim() !== "") items = items.filter(w => String(w.created_at || "") < String(cursor))

  const page = items.slice(0, limit)
  const nextCursor = page.length > 0 ? String(page[page.length - 1].created_at || "") : ""
  const hasMore = items.length > page.length

  return {
    ok: true,
    data: {
      items: page,
      next_cursor: hasMore && nextCursor ? nextCursor : null
    }
  }
}

function createManualWosEvidenceEvent(tenantId, input) {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "body: JSON object required" }, status: 422 }
  }

  const actor = String(input.actor || "").trim()
  const action = String(input.action || "").trim()
  const entityType = String(input.entity_type || "").trim()
  const entityId = String(input.entity_id || "").trim()

  if (!actor) return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.actor: Field required" }, status: 422 }
  if (!action) return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.action: Field required" }, status: 422 }
  if (!entityType) return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.entity_type: Field required" }, status: 422 }
  if (!entityId) return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.entity_id: Field required" }, status: 422 }

  const evt = emitWosEvidenceEvent(tenantId, {
    actor,
    action,
    entity_type: entityType,
    entity_id: entityId,
    snapshot: input.snapshot === undefined ? null : input.snapshot
  })

  return { ok: true, data: evt }
}

function isKnownWorkerStatusForAudit(s) {
  return s === "active" || s === "inactive" || s === "suspended"
}

function allowedNextWorkerStatusesForAudit(s) {
  if (s === "active") return ["inactive", "suspended"]
  if (s === "inactive") return ["active"]
  if (s === "suspended") return ["active", "inactive"]
  return []
}

function buildWorkerAudit(w) {
  const status = String(w && w.status ? w.status : "")
  const type = String(w && w.type ? w.type : "")
  const email = w && Object.prototype.hasOwnProperty.call(w, "email") ? w.email : null
  const skills = w && Object.prototype.hasOwnProperty.call(w, "skills") ? w.skills : null
  const availability = w && Object.prototype.hasOwnProperty.call(w, "availability") ? w.availability : null

  const invariants = []

  invariants.push({
    rule: "worker.exists",
    ok: Boolean(w),
    details: w ? null : "worker not found"
  })

  invariants.push({
    rule: "worker.type.known",
    ok: isWorkerType(type),
    details: isWorkerType(type) ? null : `unknown type '${type}'`
  })

  invariants.push({
    rule: "worker.status.known",
    ok: isKnownWorkerStatusForAudit(status),
    details: isKnownWorkerStatusForAudit(status) ? null : `unknown status '${status}'`
  })

  const emailOk = email === null || (typeof email === "string" && email.trim() !== "")
  invariants.push({
    rule: "worker.email.valid",
    ok: emailOk,
    details: emailOk ? null : "email must be null or non-empty string"
  })

  const skillsOk = Array.isArray(skills)
  invariants.push({
    rule: "worker.skills.valid",
    ok: skillsOk,
    details: skillsOk ? null : "skills must be an array"
  })

  let hpwOk = true
  let hpwDetails = null
  if (availability && typeof availability === "object" && !Array.isArray(availability)) {
    const v = availability.hours_per_week
    if (v === null || v === undefined) {
      hpwOk = true
    } else {
      const n = Number(v)
      hpwOk = Number.isFinite(n) && n >= 0 && n <= 168
      if (!hpwOk) hpwDetails = "availability.hours_per_week must be between 0 and 168 or null"
    }
  } else if (availability === null || availability === undefined) {
    hpwOk = true
  } else {
    hpwOk = false
    hpwDetails = "availability must be an object or null"
  }

  invariants.push({
    rule: "worker.availability.hours_per_week.valid",
    ok: hpwOk,
    details: hpwOk ? null : hpwDetails
  })

  return {
    id: w.id,
    current_status: status,
    allowed_next_statuses: isKnownWorkerStatusForAudit(status) ? allowedNextWorkerStatusesForAudit(status) : [],
    invariants,
    last_updated_at: w.updated_at || w.created_at || null
  }
}

function isKnownWorkerStatusForTransitions(s) {
  return s === "active" || s === "inactive" || s === "suspended"
}

function canTransitionWorkerStatus(fromStatus, toStatus) {
  const from = String(fromStatus || "")
  const to = String(toStatus || "")
  if (!isKnownWorkerStatusForTransitions(from)) return false
  if (!isKnownWorkerStatusForTransitions(to)) return false

  if (from === "active") return to === "inactive" || to === "suspended"
  if (from === "inactive") return to === "active"
  if (from === "suspended") return to === "active" || to === "inactive"
  return false
}

function transitionWorkerStatus(tenantId, id, toStatus, actor, actionName) {
  const w = getWosWorker(tenantId, id)
  if (!w) return { ok: false, error: { code: "NOT_FOUND", message: "Worker not found" }, status: 404 }

  const from = String(w.status || "")
  const to = String(toStatus || "")

  if (!isKnownWorkerStatusForTransitions(from)) {
    return { ok: false, error: { code: "INVALID_STATE", message: `Worker status '${from}' is not eligible for transitions` }, status: 409 }
  }

  if (!canTransitionWorkerStatus(from, to)) {
    return {
      ok: false,
      error: { code: "INVALID_STATE", message: `Cannot transition worker status from '${from}' to '${to}'` },
      status: 409
    }
  }

  const next = { ...w, status: to, updated_at: nowIso() }
  const tenant = getTenantStore(tenantId)
  tenant.wosWorkers.set(id, next)
  schedulePersist(tenantId)

  emitWosEvidenceEvent(tenantId, {
    actor,
    action: actionName,
    entity_type: "wos.worker",
    entity_id: id,
    snapshot: {
      from_status: from,
      to_status: to,
      worker: next
    }
  })

  return { ok: true, data: next }
}

function matchRoute(method, pathname) {
  const m = method.toUpperCase()

  // S34: public probes — no auth required
  if (m === "GET" && pathname === "/api/health") return { name: "api.health",  params: {} }
  if (m === "GET" && pathname === "/api/ready")  return { name: "api.ready",   params: {} }

  if (m === "POST" && pathname === "/api/jobs") return { name: "jobs.create", params: {} }
  if (m === "GET" && pathname === "/api/jobs") return { name: "jobs.list", params: {} }

  const jobIdMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/)
  if (m === "GET" && jobIdMatch) return { name: "jobs.get", params: { job_id: jobIdMatch[1] } }

  const jobCloseMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/close$/)
  if (m === "POST" && jobCloseMatch) return { name: "jobs.close", params: { job_id: jobCloseMatch[1] } }

  const proposalsMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/proposals$/)
  if (m === "POST" && proposalsMatch) return { name: "proposals.create", params: { job_id: proposalsMatch[1] } }
  if (m === "GET" && proposalsMatch) return { name: "proposals.list", params: { job_id: proposalsMatch[1] } }

  const proposalAcceptMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/proposals\/([^/]+)\/accept$/)
  if (m === "POST" && proposalAcceptMatch) {
    return { name: "proposals.accept", params: { job_id: proposalAcceptMatch[1], proposal_id: proposalAcceptMatch[2] } }
  }

  const proposalRejectMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/proposals\/([^/]+)\/reject$/)
  if (m === "POST" && proposalRejectMatch) {
    return { name: "proposals.reject", params: { job_id: proposalRejectMatch[1], proposal_id: proposalRejectMatch[2] } }
  }

  if (m === "POST" && pathname === "/api/contracts/intent") return { name: "contracts.intent.create", params: {} }
  if (m === "GET" && pathname === "/api/contracts/intent") return { name: "contracts.intent.list", params: {} }

  const ciAuditMatch = pathname.match(/^\/api\/contracts\/intent\/([^/]+)\/audit$/)
  if (m === "GET" && ciAuditMatch) return { name: "contracts.intent.audit", params: { id: ciAuditMatch[1] } }

  const ciGetMatch = pathname.match(/^\/api\/contracts\/intent\/([^/]+)$/)
  if (m === "GET" && ciGetMatch) return { name: "contracts.intent.get", params: { id: ciGetMatch[1] } }

  const ciSendMatch = pathname.match(/^\/api\/contracts\/intent\/([^/]+)\/send$/)
  if (m === "POST" && ciSendMatch) return { name: "contracts.intent.send", params: { id: ciSendMatch[1] } }

  const ciAcceptMatch = pathname.match(/^\/api\/contracts\/intent\/([^/]+)\/accept$/)
  if (m === "POST" && ciAcceptMatch) return { name: "contracts.intent.accept", params: { id: ciAcceptMatch[1] } }

  if (m === "POST" && pathname === "/api/wos/workers") return { name: "wos.workers.create", params: {} }
  if (m === "GET" && pathname === "/api/wos/workers") return { name: "wos.workers.list", params: {} }

  const wosWorkerAuditMatch = pathname.match(/^\/api\/wos\/workers\/([^/]+)\/audit$/)
  if (m === "GET" && wosWorkerAuditMatch) return { name: "wos.workers.audit", params: { id: wosWorkerAuditMatch[1] } }

  const wosWorkerActivateMatch = pathname.match(/^\/api\/wos\/workers\/([^/]+)\/activate$/)
  if (m === "POST" && wosWorkerActivateMatch) return { name: "wos.workers.activate", params: { id: wosWorkerActivateMatch[1] } }

  const wosWorkerDeactivateMatch = pathname.match(/^\/api\/wos\/workers\/([^/]+)\/deactivate$/)
  if (m === "POST" && wosWorkerDeactivateMatch) return { name: "wos.workers.deactivate", params: { id: wosWorkerDeactivateMatch[1] } }

  const wosWorkerSuspendMatch = pathname.match(/^\/api\/wos\/workers\/([^/]+)\/suspend$/)
  if (m === "POST" && wosWorkerSuspendMatch) return { name: "wos.workers.suspend", params: { id: wosWorkerSuspendMatch[1] } }

  const wosWorkerGetMatch = pathname.match(/^\/api\/wos\/workers\/([^/]+)$/)
  if (m === "GET" && wosWorkerGetMatch) return { name: "wos.workers.get", params: { id: wosWorkerGetMatch[1] } }
  if (m === "PATCH" && wosWorkerGetMatch) return { name: "wos.workers.patch", params: { id: wosWorkerGetMatch[1] } }

  if (m === "GET" && pathname === "/api/wos/evidence-events") return { name: "wos.evidence.list", params: {} }
  if (m === "GET" && pathname === "/wos/evidence-events") return { name: "wos.evidence.ui", params: {} }
  if (m === "POST" && pathname === "/api/wos/evidence-events") return { name: "wos.evidence.create", params: {} }

  if (m === "GET" && pathname === "/api/admin/version") return { name: "admin.version", params: {} }
  if (m === "GET" && pathname === "/api/admin/health") return { name: "admin.health", params: {} }
  if (m === "GET" && pathname === "/api/admin/stats") return { name: "admin.stats", params: {} }
  if (m === "GET" && pathname === "/api/admin/governance") return { name: "admin.governance", params: {} }
  if (m === "GET" && pathname === "/api/admin/workers") return { name: "admin.workers.list", params: {} }
  if (m === "GET" && pathname === "/api/admin/assignments") return { name: "admin.assignments.list", params: {} }
  if (m === "GET" && pathname === "/api/admin/evidence/export") return { name: "admin.evidence.export", params: {} }
  if (m === "GET" && pathname === "/api/admin/evidence") return { name: "admin.evidence.list", params: {} }
  if (m === "GET" && pathname === "/api/admin/pods") return { name: "admin.pods.list", params: {} }
  if (m === "GET" && pathname === "/api/admin/scheduler/preview") return { name: "admin.scheduler.preview", params: {} }
  if (m === "GET" && pathname === "/api/admin/scheduler/status") return { name: "admin.scheduler.status", params: {} }
  if (m === "POST" && pathname === "/api/admin/scheduler/run-once") return { name: "admin.scheduler.run_once", params: {} }
  if (m === "POST" && pathname === "/api/admin/scheduler/interval/start") return { name: "admin.scheduler.interval.start", params: {} }
  if (m === "POST" && pathname === "/api/admin/scheduler/interval/stop") return { name: "admin.scheduler.interval.stop", params: {} }
  if (m === "POST" && pathname === "/api/admin/scheduler/run") return { name: "admin.scheduler.run", params: {} }

  // S32: scheduler engine routes
  if (m === "GET"  && pathname === "/api/admin/scheduler") return { name: "admin.scheduler.get",  params: {} }
  if (m === "POST" && pathname === "/api/admin/scheduler/start") return { name: "admin.scheduler.start", params: {} }
  if (m === "POST" && pathname === "/api/admin/scheduler/stop")  return { name: "admin.scheduler.stop",  params: {} }
  const schedPauseMatch  = pathname.match(/^\/api\/admin\/scheduler\/([^/]+)\/pause$/)
  if (m === "POST" && schedPauseMatch)  return { name: "admin.scheduler.tenant.pause",  params: { tenant: schedPauseMatch[1]  } }
  const schedResumeMatch = pathname.match(/^\/api\/admin\/scheduler\/([^/]+)\/resume$/)
  if (m === "POST" && schedResumeMatch) return { name: "admin.scheduler.tenant.resume", params: { tenant: schedResumeMatch[1] } }

  if (m === "GET" && pathname === "/api/admin/principals") return { name: "admin.principals.list", params: {} }
  if (m === "POST" && pathname === "/api/admin/principals") return { name: "admin.principals.create", params: {} }

  if (m === "POST" && pathname === "/api/admin/bootstrap/superadmin") return { name: "admin.bootstrap.superadmin", params: {} }

  // S30: tenant registry
  if (m === "GET"  && pathname === "/api/admin/tenants") return { name: "admin.tenants.list",   params: {} }
  if (m === "POST" && pathname === "/api/admin/tenants") return { name: "admin.tenants.create", params: {} }

  const tenantIdMatch = pathname.match(/^\/api\/admin\/tenants\/([^/]+)$/)
  if (m === "GET"  && tenantIdMatch) return { name: "admin.tenants.get",     params: { id: tenantIdMatch[1] } }

  const tenantDisableMatch = pathname.match(/^\/api\/admin\/tenants\/([^/]+)\/disable$/)
  if (m === "POST" && tenantDisableMatch) return { name: "admin.tenants.disable", params: { id: tenantDisableMatch[1] } }

  const tenantEnableMatch = pathname.match(/^\/api\/admin\/tenants\/([^/]+)\/enable$/)
  if (m === "POST" && tenantEnableMatch) return { name: "admin.tenants.enable",  params: { id: tenantEnableMatch[1] } }

  // S33: analytics routes — exact paths before /:tenant wildcard
  if (m === "GET"  && pathname === "/api/admin/analytics")           return { name: "admin.analytics.list",      params: {} }
  if (m === "POST" && pathname === "/api/admin/analytics/snapshot")  return { name: "admin.analytics.snapshot",  params: {} }
  if (m === "GET"  && pathname === "/api/admin/analytics/snapshots") return { name: "admin.analytics.snapshots", params: {} }
  const analyticsIdMatch = pathname.match(/^\/api\/admin\/analytics\/([^/]+)$/)
  if (m === "GET"  && analyticsIdMatch) return { name: "admin.analytics.tenant", params: { id: analyticsIdMatch[1] } }

  // Phase 11: permission-bound operational control routes
  if (m === "GET"  && pathname === "/api/ops/status")        return { name: "ops.status",        params: {} }
  if (m === "POST" && pathname === "/api/ops/execute")       return { name: "ops.execute",       params: {} }
  if (m === "POST" && pathname === "/api/ops/retry")         return { name: "ops.retry",         params: {} }
  if (m === "POST" && pathname === "/api/ops/override")      return { name: "ops.override",      params: {} }

  // Phase 13: approval-bound privileged operation routes
  if (m === "POST" && pathname === "/api/approvals/request") return { name: "approvals.request.create", params: {} }
  const approvalIdMatch = pathname.match(/^\/api\/approvals\/([^/]+)\/(approve|deny)$/)
  if (m === "POST" && approvalIdMatch) {
    return { name: `approvals.request.${approvalIdMatch[2]}`, params: { id: approvalIdMatch[1] } }
  }
  if (m === "POST" && pathname === "/api/ops/force-execute")   return { name: "ops.force_execute",   params: {} }
  if (m === "POST" && pathname === "/api/admin/config-change") return { name: "admin.config_change", params: {} }

  // Phase 14: sovereign control registry routes
  if (m === "GET"  && pathname === "/api/admin/policy-registry")        return { name: "policy.registry.list",   params: {} }
  if (m === "GET"  && pathname === "/api/admin/policy-registry/export") return { name: "policy.registry.export", params: {} }
  const policyKeyMatch = pathname.match(/^\/api\/admin\/policy-registry\/(.+)\/(disable|enable)$/)
  if (m === "POST" && policyKeyMatch) {
    return { name: `policy.registry.${policyKeyMatch[2]}`, params: { key: decodeURIComponent(policyKeyMatch[1]) } }
  }

  // Phase 15: tenant/jurisdiction governance routes
  if (m === "GET"  && pathname === "/api/admin/tenant-governance")              return { name: "tenant.governance.list",         params: {} }
  if (m === "GET"  && pathname === "/api/admin/tenant-governance/export")       return { name: "tenant.governance.export",        params: {} }
  if (m === "GET"  && pathname === "/api/admin/tenant-governance/jurisdictions") return { name: "tenant.governance.jurisdictions", params: {} }
  const tgSetJurMatch = pathname.match(/^\/api\/admin\/tenant-governance\/([^/]+)\/set-jurisdiction$/)
  if (m === "POST" && tgSetJurMatch) {
    return { name: "tenant.governance.set_jurisdiction", params: { tenantId: tgSetJurMatch[1] } }
  }
  // Phase 15: governed proof routes — tenant/jurisdiction-gated privileged operation validators
  if (m === "POST" && pathname === "/api/ops/governed-override")        return { name: "ops.governed_override",        params: {} }
  if (m === "POST" && pathname === "/api/ops/governed-force-execute")   return { name: "ops.governed_force_execute",   params: {} }

  // Phase 16: evidence governance admin routes
  if (m === "GET"  && pathname === "/api/admin/evidence-governance")            return { name: "evidence.governance.list",      params: {} }
  if (m === "GET"  && pathname === "/api/admin/evidence-governance/export")     return { name: "evidence.governance.export",     params: {} }
  if (m === "GET"  && pathname === "/api/admin/evidence-governance/residency")  return { name: "evidence.governance.residency",  params: {} }
  if (m === "GET"  && pathname === "/api/admin/evidence-governance/retention")  return { name: "evidence.governance.retention",  params: {} }
  const egRetentionMatch = pathname.match(/^\/api\/admin\/evidence-governance\/retention\/(.+)\/(disable|enable)$/)
  if (m === "POST" && egRetentionMatch) {
    return { name: `evidence.governance.retention.${egRetentionMatch[2]}`, params: { retentionClass: decodeURIComponent(egRetentionMatch[1]) } }
  }
  // Phase 16: governed evidence write proof route — residency + retention gated
  if (m === "POST" && pathname === "/api/ops/governed-evidence-write") return { name: "ops.governed_evidence_write", params: {} }

  // Phase 17: disclosure governance admin routes
  if (m === "GET"  && pathname === "/api/admin/disclosure-governance")              return { name: "disclosure.governance.list",         params: {} }
  if (m === "GET"  && pathname === "/api/admin/disclosure-governance/export")       return { name: "disclosure.governance.export",        params: {} }
  if (m === "GET"  && pathname === "/api/admin/disclosure-governance/bases")        return { name: "disclosure.governance.bases",         params: {} }
  if (m === "GET"  && pathname === "/api/admin/disclosure-governance/legal-holds")  return { name: "disclosure.governance.legal_holds",   params: {} }
  if (m === "POST" && pathname === "/api/admin/disclosure-governance/legal-hold")   return { name: "disclosure.governance.legal_hold.create", params: {} }
  const dlhReleaseMatch = pathname.match(/^\/api\/admin\/disclosure-governance\/legal-hold\/([^/]+)\/release$/)
  if (m === "POST" && dlhReleaseMatch) {
    return { name: "disclosure.governance.legal_hold.release", params: { holdId: dlhReleaseMatch[1] } }
  }
  // Phase 17: governed proof routes — disclosure + legal hold gated
  if (m === "POST" && pathname === "/api/ops/governed-disclosure") return { name: "ops.governed_disclosure", params: {} }
  if (m === "POST" && pathname === "/api/ops/governed-disposal")   return { name: "ops.governed_disposal",   params: {} }

  return null
}

function notFound(res) {
  fail(res, "NOT_FOUND", "Route not found", 404)
}

function methodNotAllowed(res) {
  fail(res, "METHOD_NOT_ALLOWED", "Method not allowed", 405)
}

function health(res) {
  ok(res, { service: "pro-work", health: "ok", time: nowIso(), ...bootMeta() }, 200)
}

function invalidState(res, message) {
  fail(res, "INVALID_STATE", message, 409)
}

function actorFromReq(req) {
  const h = req.headers["x-actor"]
  const actor = h === undefined || h === null ? "" : String(h).trim()
  return actor || "user"
}

function listAdminWorkers(tenantId, query) {
  const allowed = new Set(["status", "worker_type", "tenant_id"])
  for (const k of query.keys()) {
    if (!allowed.has(k)) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: `query.${k}: Unsupported query param` }, status: 422 }
    }
  }

  const status = query.get("status")
  const workerType = query.get("worker_type")

  const tenant = getTenantStore(tenantId)
  let items = Array.from(tenant.wosWorkers.values())

  if (workerType && String(workerType).trim() !== "") {
    const t = String(workerType).trim()
    if (!isWorkerType(t)) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "query.worker_type: Must be 'FTE' or 'FREELANCER'" }, status: 422 }
    }
    items = items.filter(w => String(w.type) === t)
  }

  if (status && String(status).trim() !== "") {
    const s = String(status).trim()
    items = items.filter(w => String(w.status) === s)
  }

  items.sort((a, b) => {
    const aa = String(a.created_at || "")
    const bb = String(b.created_at || "")
    if (aa === bb) return 0
    return aa > bb ? -1 : 1
  })

  const shaped = items.map(w => {
    return {
      id: w.id,
      name: String(w.display_name || ""),
      email: w.email === null || w.email === undefined ? null : String(w.email),
      worker_type: String(w.type || ""),
      title: null,
      status: String(w.status || ""),
      assigned_pod: null,
      created_at: w.created_at || null,
      updated_at: w.updated_at || null
    }
  })

  return { ok: true, data: shaped }
}

function adminStatsSnapshot(tenantId) {
  const tenant = getTenantStore(tenantId)
  const workers = Array.from(tenant.wosWorkers.values())
  const fte = workers.filter(w => String(w.type) === "FTE").length
  const freelancer = workers.filter(w => String(w.type) === "FREELANCER").length

  const evidenceTotal = tenant.wosEvidenceEvents.length
  const recent = tenant.wosEvidenceEvents
    .slice()
    .sort((a, b) => {
      const aa = String(a.timestamp || "")
      const bb = String(b.timestamp || "")
      if (aa === bb) return 0
      return aa > bb ? -1 : 1
    })
    .slice(0, 10)

  return {
    workers: { total: workers.length, fte, freelancer },
    pods: { total: 0, by_state: {} },
    evidence: { total: evidenceTotal, recent },
    governance: { status: "pass", checks_passed: 1, checks_total: 1 }
  }
}

function adminListEvidence(tenantId, query) {
  const limit  = normalizeLimit(query.get("limit"))
  const cursor = String(query.get("cursor") || "").trim()
  const type   = String(query.get("type")   || "").trim()
  const actor  = String(query.get("actor")  || "").trim()

  const tenant = getTenantStore(tenantId)
  let items = tenant.wosEvidenceEvents.slice()

  if (type)   items = items.filter(e => String(e.action || "") === type)
  if (actor)  items = items.filter(e => String(e.actor  || "") === actor)

  // sort descending by timestamp
  items.sort((a, b) => {
    const aa = String(a.timestamp || "")
    const bb = String(b.timestamp || "")
    return aa > bb ? -1 : aa < bb ? 1 : 0
  })

  // cursor = exclusive upper bound on timestamp (return events older than cursor)
  if (cursor) items = items.filter(e => String(e.timestamp || "") < cursor)

  const page      = items.slice(0, limit)
  const hasMore   = items.length > limit
  const nextCursor = hasMore && page.length > 0 ? String(page[page.length - 1].timestamp || "") : null

  return { items: page, next_cursor: nextCursor, has_more: hasMore }
}

function adminGovernanceSnapshot() {
  return {
    last_doctor_run: {
      status: "pass",
      passed: 1,
      total: 1,
      timestamp: nowIso()
    },
    ci_status: {
      status: "pass",
      branch: "local",
      last_run: nowIso(),
      note: "Local placeholder. Use GitHub Actions for authoritative CI status."
    },
    checks: [
      { name: "admin_api_shapes", status: "pass", message: "Admin endpoints are reachable and return stable shapes" }
    ],
    notes: [
      "S23: Contract-first conformance enforced via contracts/validate_admin_rbac.sh"
    ]
  }
}

/* =========================================================
S25-C-WOS-SCHEDULER_AUTOMATION
Operational controls: status + interval start/stop + run-once
========================================================= */

const wosSchedulerCtl = {
  enabled: false,
  interval_ms: null,
  timer: null,
  running: false,
  last_run: null,
  last_error: null,
  tenantStats: {}  // { [tenantId]: { last_run, last_error } }
}

function wosSchedulerClampInt(v, def, min, max) {
  const n = Number.parseInt(String(v ?? ""), 10)
  if (Number.isNaN(n)) return def
  return Math.min(Math.max(n, min), max)
}

function wosSchedulerCtlStopTimer() {
  if (wosSchedulerCtl.timer) {
    clearInterval(wosSchedulerCtl.timer)
    wosSchedulerCtl.timer = null
  }
  wosSchedulerCtl.enabled = false
  wosSchedulerCtl.interval_ms = null
}

function serveStatic(res, filePath, contentType) {
  try {
    const data = fs.readFileSync(filePath)
    res.writeHead(200, { "Content-Type": contentType })
    res.end(data)
  } catch (err) {
    res.writeHead(404)
    res.end("Not found")
  }
}

function wosSchedulerCtlSnapshot() {
  const tenants = {}
  for (const [tid, stats] of Object.entries(wosSchedulerCtl.tenantStats)) {
    tenants[tid] = { last_run: stats.last_run, last_error: stats.last_error }
  }
  return {
    enabled: Boolean(wosSchedulerCtl.enabled),
    interval_ms: wosSchedulerCtl.interval_ms,
    running: Boolean(wosSchedulerCtl.running),
    last_run: wosSchedulerCtl.last_run,
    last_error: wosSchedulerCtl.last_error,
    tenants
  }
}

const server = http.createServer(async (req, res) => {
  // Phase 12: propagate or generate correlation/request IDs at request boundary
  const correlationId = String(req.headers["x-correlation-id"] || AuthzAudit.generateCorrelationId())
  const requestId     = String(req.headers["x-request-id"]     || AuthzAudit.generateRequestId())

  try {
    const url = new URL(req.url, `http://${req.headers.host || HOST}`)
    const pathname = url.pathname

    // S35: security headers + CORS on every response
    setSecureHeaders(res)
    res.setHeader("X-Correlation-Id", correlationId)
    res.setHeader("X-Request-Id",     requestId)
    if (!applyCors(req, res)) return
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end() }

    // S28: Admin UI static serve
    if (req.method === "GET" && pathname === "/admin") {
      return serveStatic(res, path.join(UI_DIST, "index.html"), "text/html")
    }

    if (req.method === "GET" && pathname.startsWith("/admin/assets/")) {
      const assetPath = path.join(UI_DIST, pathname.replace("/admin/", ""))
      const ext = path.extname(assetPath)
      const types = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" }
      return serveStatic(res, assetPath, types[ext] || "application/octet-stream")
    }

    const route = matchRoute(req.method || "GET", pathname)
    if (!route) return fail(res, "NOT_FOUND", "Route not found", 404)

    // S35: rate limiting
    if (pathname.startsWith("/api/admin")) {
      if (!checkRateLimit(req, res, _RL_ADMIN_MAX)) return
    } else if (req.method !== "GET" && req.method !== "HEAD" && pathname.startsWith("/api/")) {
      if (!checkRateLimit(req, res, _RL_WRITE_MAX)) return
    }

    const tenantId = resolveTenantId(req)
    const tenant = getTenantStore(tenantId)

    if (route.name === "health") return ok(res, { service: "pro-work", health: "ok", time: nowIso(), ...bootMeta() }, 200)

    // S34: public probes ──────────────────────────────────────────────────────
    if (route.name === "api.health") {
      return ok(res, {
        status:   "healthy",
        service:  "pro-work",
        version:  SYSTEM_VERSION,
        uptime_s: Math.floor(process.uptime()),
        time:     nowIso()
      })
    }

    if (route.name === "api.ready") {
      const tenantCount = Object.keys(tenantRegistry).length
      if (tenantCount === 0) {
        return fail(res, "NOT_READY", "registry not initialised", 503)
      }
      return ok(res, {
        status:       "ready",
        tenant_count: tenantCount,
        scheduler:    { enabled: Scheduler.snapshot().enabled }
      })
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (route.name === "jobs.create") {
      const body = await readJson(req, res)
      if (!body) return

      if (!validateRequired(res, "body.title", body.title)) return
      if (!validateRequired(res, "body.description", body.description)) return
      if (!validateRequired(res, "body.budget", body.budget)) return
      const budget = validateNumber(res, "body.budget", body.budget)
      if (budget === null) return

      const job = createJob({ title: body.title, description: body.description, budget })
      return ok(res, job, 201)
    }

    if (route.name === "jobs.list") return ok(res, listJobs(), 200)

    if (route.name === "jobs.get") {
      const job = getJob(route.params.job_id)
      if (!job) return fail(res, "NOT_FOUND", "Job not found", 404)
      return ok(res, job, 200)
    }

    if (route.name === "jobs.close") {
      await readJson(req, res).catch(() => null)
      const job = getJob(route.params.job_id)
      if (!job) return fail(res, "NOT_FOUND", "Job not found", 404)
      if (job.status !== "open") return fail(res, "INVALID_STATE", `Cannot close job in '${job.status}' status. Job must be 'open'`, 409)
      const closed = updateJob(job, { status: "completed" })
      return ok(res, closed, 200)
    }

    if (route.name === "proposals.create") {
      const jobId = route.params.job_id
      const job = getJob(jobId)
      if (!job) return fail(res, "NOT_FOUND", "Job not found", 404)

      const body = await readJson(req, res)
      if (!body) return

      if (!validateRequired(res, "body.freelancer_name", body.freelancer_name)) return
      if (!validateRequired(res, "body.price", body.price)) return
      if (!validateRequired(res, "body.message", body.message)) return
      const price = validateNumber(res, "body.price", body.price)
      if (price === null) return

      const proposal = createProposal(jobId, { freelancer_name: body.freelancer_name, price, message: body.message })
      return ok(res, proposal, 201)
    }

    if (route.name === "proposals.list") {
      const jobId = route.params.job_id
      const job = getJob(jobId)
      if (!job) return fail(res, "NOT_FOUND", "Job not found", 404)
      return ok(res, listProposals(jobId), 200)
    }

    if (route.name === "proposals.accept") {
      await readJson(req, res).catch(() => null)
      const jobId = route.params.job_id
      const proposalId = route.params.proposal_id

      const job = getJob(jobId)
      if (!job) return fail(res, "NOT_FOUND", "Job not found", 404)
      if (job.status !== "open") return fail(res, "INVALID_STATE", `Cannot accept proposals for job in '${job.status}' status. Job must be 'open'`, 409)

      const proposal = getProposal(proposalId)
      if (!proposal) return fail(res, "NOT_FOUND", "Proposal not found", 404)
      if (proposal.job_id !== jobId) return fail(res, "VALIDATION_ERROR", "proposal_id does not belong to job_id", 422)
      if (proposal.status !== "pending") return fail(res, "INVALID_STATE", `Cannot accept proposal in '${proposal.status}' status. Proposal must be 'pending'`, 409)

      const accepted = updateProposal(proposal, { status: "accepted" })

      const all = listProposals(jobId)
      for (const p of all) {
        if (p.id !== accepted.id && p.status === "pending") updateProposal(p, { status: "rejected" })
      }

      updateJob(job, { status: "in_progress" })

      return ok(res, accepted, 200)
    }

    if (route.name === "proposals.reject") {
      await readJson(req, res).catch(() => null)
      const jobId = route.params.job_id
      const proposalId = route.params.proposal_id

      const job = getJob(jobId)
      if (!job) return fail(res, "NOT_FOUND", "Job not found", 404)
      if (job.status !== "open") return fail(res, "INVALID_STATE", `Cannot reject proposals for job in '${job.status}' status. Job must be 'open'`, 409)

      const proposal = getProposal(proposalId)
      if (!proposal) return fail(res, "NOT_FOUND", "Proposal not found", 404)
      if (proposal.job_id !== jobId) return fail(res, "VALIDATION_ERROR", "proposal_id does not belong to job_id", 422)
      if (proposal.status !== "pending") return fail(res, "INVALID_STATE", `Cannot reject proposal in '${proposal.status}' status. Proposal must be 'pending'`, 409)

      const rejected = updateProposal(proposal, { status: "rejected" })
      return ok(res, rejected, 200)
    }

    if (route.name === "contracts.intent.create") {
      const body = await readJson(req, res)
      if (!body) return

      if (!validateRequired(res, "body.job_id", body.job_id)) return
      if (!validateRequired(res, "body.proposal_id", body.proposal_id)) return
      if (!validateRequired(res, "body.buyer_name", body.buyer_name)) return
      if (!validateRequired(res, "body.terms_summary", body.terms_summary)) return

      const job = getJob(String(body.job_id))
      if (!job) return fail(res, "NOT_FOUND", "Job not found", 404)

      const proposal = getProposal(String(body.proposal_id))
      if (!proposal) return fail(res, "NOT_FOUND", "Proposal not found", 404)
      if (String(proposal.job_id) !== String(body.job_id)) return fail(res, "VALIDATION_ERROR", "proposal_id does not belong to job_id", 422)

      const ci = createContractIntent({
        job_id: String(body.job_id),
        proposal_id: String(body.proposal_id),
        buyer_name: body.buyer_name,
        terms_summary: body.terms_summary
      })
      return ok(res, ci, 201)
    }

    if (route.name === "contracts.intent.list") {
      const out = listContractIntents(url.searchParams)
      if (!out.ok) return fail(res, out.error.code, out.error.message, out.status || 422)
      return ok(res, out.data, 200)
    }

    if (route.name === "contracts.intent.get") {
      const ci = getContractIntent(route.params.id)
      if (!ci) return fail(res, "NOT_FOUND", "Contract intent not found", 404)
      return ok(res, ci, 200)
    }

    if (route.name === "contracts.intent.audit") {
      const ci = getContractIntent(route.params.id)
      if (!ci) return fail(res, "NOT_FOUND", "Contract intent not found", 404)
      return ok(res, buildContractIntentAudit(ci), 200)
    }

    if (route.name === "contracts.intent.send") {
      await readJson(req, res).catch(() => null)
      const ci = getContractIntent(route.params.id)
      if (!ci) return fail(res, "NOT_FOUND", "Contract intent not found", 404)
      if (ci.status !== "draft") return fail(res, "INVALID_STATE", `Cannot send contract intent in '${ci.status}' status. Must be 'draft'`, 409)

      const proposal = getProposal(ci.proposal_id)
      if (!proposal) return fail(res, "NOT_FOUND", "Proposal not found", 404)
      if (proposal.status !== "accepted") return fail(res, "INVALID_STATE", "Cannot send contract intent because proposal is not accepted", 409)

      return ok(res, updateContractIntent(ci, { status: "sent" }), 200)
    }

    if (route.name === "contracts.intent.accept") {
      await readJson(req, res).catch(() => null)
      const ci = getContractIntent(route.params.id)
      if (!ci) return fail(res, "NOT_FOUND", "Contract intent not found", 404)
      if (ci.status !== "sent") return fail(res, "INVALID_STATE", `Cannot accept contract intent in '${ci.status}' status. Must be 'sent'`, 409)

      const proposal = getProposal(ci.proposal_id)
      if (!proposal) return fail(res, "NOT_FOUND", "Proposal not found", 404)
      if (proposal.status !== "accepted") return fail(res, "INVALID_STATE", "Cannot accept contract intent because proposal is not accepted", 409)

      return ok(res, updateContractIntent(ci, { status: "accepted" }), 200)
    }

    // S30: enforce tenant registry on all WOS routes
    if (route.name.startsWith("wos.")) {
      if (!requireTenantActive(res, tenantId)) return
      // S30: auth gate for WOS writes when WOS_PUBLIC_WRITE=false (default)
      if (!WOS_PUBLIC_WRITE && (req.method === "POST" || req.method === "PATCH")) {
        const ap = Admin.authenticate(req)
        if (!ap.ok) return failFromAdmin(res, ap)
        if (!requireTenantAccess(res, ap.principal, tenantId)) return
      }
    }

    if (route.name === "wos.workers.create") {
      const body = await readJson(req, res)
      if (!body) return
      const actor = actorFromReq(req)
      const out = createWosWorker(tenantId, body, actor)
      if (!out.ok) return fail(res, out.error.code, out.error.message, out.status || 422)
      return ok(res, out.data, 201)
    }

    if (route.name === "wos.workers.list") {
      const out = listWosWorkersQuery(tenantId, url.searchParams)
      if (!out.ok) return fail(res, out.error.code, out.error.message, out.status || 422)
      return ok(res, out.data, 200)
    }

    if (route.name === "wos.workers.audit") {
      const w = getWosWorker(tenantId, route.params.id)
      if (!w) return fail(res, "NOT_FOUND", "Worker not found", 404)
      const audit = buildWorkerAudit(w)
      return ok(res, audit, 200)
    }

    if (route.name === "wos.workers.activate") {
      await readJson(req, res).catch(() => null)
      const actor = actorFromReq(req)
      const out = transitionWorkerStatus(tenantId, route.params.id, "active", actor, "wos.worker.activate")
      if (!out.ok) return fail(res, out.error.code, out.error.message, out.status || 422)
      return ok(res, out.data, 200)
    }

    if (route.name === "wos.workers.deactivate") {
      await readJson(req, res).catch(() => null)
      const actor = actorFromReq(req)
      const out = transitionWorkerStatus(tenantId, route.params.id, "inactive", actor, "wos.worker.deactivate")
      if (!out.ok) return fail(res, out.error.code, out.error.message, out.status || 422)
      return ok(res, out.data, 200)
    }

    if (route.name === "wos.workers.suspend") {
      await readJson(req, res).catch(() => null)
      const actor = actorFromReq(req)
      const out = transitionWorkerStatus(tenantId, route.params.id, "suspended", actor, "wos.worker.suspend")
      if (!out.ok) return fail(res, out.error.code, out.error.message, out.status || 422)
      return ok(res, out.data, 200)
    }

    if (route.name === "wos.workers.get") {
      const w = getWosWorker(tenantId, route.params.id)
      if (!w) return fail(res, "NOT_FOUND", "Worker not found", 404)
      return ok(res, w, 200)
    }

    if (route.name === "wos.workers.patch") {
      const body = await readJson(req, res)
      if (!body) return
      const actor = actorFromReq(req)
      const out = patchWosWorker(tenantId, route.params.id, body, actor)
      if (!out.ok) return fail(res, out.error.code, out.error.message, out.status || 422)
      return ok(res, out.data, 200)
    }

    if (route.name === "wos.evidence.list") {
      const out = listWosEvidenceEventsQuery(tenantId, url.searchParams)
      if (!out.ok) return fail(res, out.error.code, out.error.message, out.status || 422)
      return ok(res, out.data, 200)
    }

    if (route.name === "wos.evidence.ui") {
      serveEvidenceEventsUi(res)
      return
    }

    if (route.name === "wos.evidence.create") {
      const body = await readJson(req, res)
      if (!body) return
      const out = createManualWosEvidenceEvent(tenantId, body)
      if (!out.ok) return fail(res, out.error.code, out.error.message, out.status || 422)
      return ok(res, out.data, 201)
    }

    if (route.name === "admin.stats") {
      const _auditCtx = { correlation_id: correlationId, request_id: requestId, route: route.name, method: req.method, decision_type: AuthzAudit.DECISION_TYPES.ADMIN_READ, perm: "admin:stats:read" }
      const ap = authenticateAndAudit(req, _auditCtx)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:stats:read", _auditCtx)) return
      // S24-C-RBAC
      const auth = ap  // S24-C: authenticated by guard above
      return ok(res, { ...bootMeta(), admin: { id: auth.principal.id, name: auth.principal.name, role: auth.principal.role }, ...adminStatsSnapshot(tenantId) }, 200)
    }

    if (route.name === "admin.version") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      return ok(res, { version: SYSTEM_VERSION, commit: BUILD_COMMIT, started_at: STARTED_AT_ISO }, 200)
    }

    if (route.name === "admin.health") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      const counts = {
        workers:         tenant.wosWorkers.size,
        pods:            tenant.wosPods.size,
        assignments:     tenant.wosAssignments.size,
        evidence_events: tenant.wosEvidenceEvents.length,
      }
      return ok(res, { ok: true, system: { version: SYSTEM_VERSION, commit: BUILD_COMMIT, started_at: STARTED_AT_ISO, uptime_s: Math.floor(process.uptime()) }, counts, scheduler: wosSchedulerCtlSnapshot() }, 200)
    }

    if (route.name === "admin.governance") {
      const _auditCtx = { correlation_id: correlationId, request_id: requestId, route: route.name, method: req.method, decision_type: AuthzAudit.DECISION_TYPES.ADMIN_READ, perm: "admin:governance:read" }
      const ap = authenticateAndAudit(req, _auditCtx)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:governance:read", _auditCtx)) return
      // S24-C-RBAC
      const auth = ap  // S24-C: authenticated by guard above
      return ok(res, { ...bootMeta(), admin: { id: auth.principal.id, name: auth.principal.name, role: auth.principal.role }, ...adminGovernanceSnapshot() }, 200)
    }

    if (route.name === "admin.workers.list") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:workers:read")) return
      if (!requireTenantAccess(res, ap.principal, tenantId)) return  // S30
      if (!requireTenantActive(res, tenantId)) return                // S30
      // S24-C-RBAC
      const auth = ap  // S24-C: authenticated by guard above
      const out = listAdminWorkers(tenantId, url.searchParams)
      if (!out.ok) return fail(res, out.error.code, out.error.message, out.status || 422)
      return ok(res, { ...bootMeta(), admin: { id: auth.principal.id, name: auth.principal.name, role: auth.principal.role }, workers: out.data }, 200)
    }

    if (route.name === "admin.pods.list") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:pods:read")) return
      if (!requireTenantAccess(res, ap.principal, tenantId)) return  // S30
      if (!requireTenantActive(res, tenantId)) return                // S30
      // S24-C-RBAC
      const auth = ap  // S24-C: authenticated by guard above
      return ok(res, { ...bootMeta(), admin: { id: auth.principal.id, name: auth.principal.name, role: auth.principal.role }, pods: [] }, 200)
    }
    if (route.name === "admin.assignments.list") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:workers:read")) return
      if (!requireTenantAccess(res, ap.principal, tenantId)) return  // S30
      if (!requireTenantActive(res, tenantId)) return                // S30

      const items = Array.from(tenant.wosAssignments.values())
      return ok(res, { items, count: items.length })
    }

    

/* =========================================================
S25-B-WOS-SCHEDULER
Deterministic WOS scheduler (preview + run)
========================================================= */

function wosSchedulerNowIso() {
  return new Date().toISOString()
}

function wosSchedulerGetCapacityMax(pod) {
  try {
    const cap = pod && pod.capacity ? pod.capacity : null
    const max = cap && Object.prototype.hasOwnProperty.call(cap, "max_workers") ? cap.max_workers : null
    const n = Number.parseInt(String(max ?? ""), 10)
    if (Number.isNaN(n)) return null
    if (n <= 0) return null
    return n
  } catch (_) {
    return null
  }
}

function wosSchedulerActiveAssignmentCount(tenantId, podId) {
  const tenant = getTenantStore(tenantId)
  let c = 0
  for (const asn of tenant.wosAssignments.values()) {
    if (!asn) continue
    if (String(asn.pod_id || "") !== String(podId || "")) continue
    if (String(asn.state || "") === "active") c++
  }
  return c
}

function wosSchedulerEligiblePods(tenantId) {
  const tenant = getTenantStore(tenantId)
  const pods = Array.from(tenant.wosPods.values())
    .filter(p => p && String(p.state || "") === "active")
    .slice()
  pods.sort((a, b) => {
    const ac = String(a.created_at || "")
    const bc = String(b.created_at || "")
    if (ac !== bc) return ac < bc ? -1 : 1
    return String(a.id || "").localeCompare(String(b.id || ""))
  })
  return pods
}

function wosSchedulerEligibleWorkers(tenantId) {
  const tenant = getTenantStore(tenantId)
  const workers = Array.from(tenant.wosWorkers.values())
    .filter(w => w && String(w.status || "") === "active" && (w.assigned_pod === null || w.assigned_pod === undefined))
    .slice()
  workers.sort((a, b) => {
    const ac = String(a.created_at || "")
    const bc = String(b.created_at || "")
    if (ac !== bc) return ac < bc ? -1 : 1
    return String(a.id || "").localeCompare(String(b.id || ""))
  })
  return workers
}

function wosSchedulerPlan(tenantId, limit) {
  const cap = Number.isInteger(limit) && limit > 0 ? limit : 50
  const pods = wosSchedulerEligiblePods(tenantId)
  const workers = wosSchedulerEligibleWorkers(tenantId)

  const planned = []
  if (!pods.length || !workers.length) {
    return { planned, stats: { eligible_pods: pods.length, unassigned_workers: workers.length } }
  }

  let podRoundRobin = 0
  for (const w of workers) {
    if (planned.length >= cap) break

    let chosen = null
    let tries = 0
    while (tries < pods.length) {
      const p = pods[podRoundRobin % pods.length]
      podRoundRobin++
      tries++

      const maxCap = wosSchedulerGetCapacityMax(p)
      const currentCount = wosSchedulerActiveAssignmentCount(tenantId, p.id)

      if (maxCap !== null && currentCount >= maxCap) continue

      chosen = p
      break
    }

    if (!chosen) break

    planned.push({
      worker_id: w.id,
      worker_display_name: w.display_name || w.name || w.id,
      pod_id: chosen.id,
      pod_name: chosen.name,
      role: "member"
    })
  }

  return {
    planned,
    stats: {
      eligible_pods: pods.length,
      unassigned_workers: workers.length,
      planned_count: planned.length
    }
  }
}

/* Execute one scheduling pass for a single tenant.
   Returns the array of planned assignment objects (empty on dry-run). */
function runSchedulerForTenant(tenantId, tenant, limit, dryRun) {
  const plan = wosSchedulerPlan(tenantId, limit)
  const planned = Array.isArray(plan && plan.planned) ? plan.planned : []

  if (!dryRun) {
    for (const it of planned) {
      const worker = tenant.wosWorkers.get(it.worker_id) || null
      const pod = tenant.wosPods.get(it.pod_id) || null
      if (!worker || !pod) continue
      if (worker.assigned_pod !== null && worker.assigned_pod !== undefined) continue

      const asnId = crypto.randomUUID()
      const asn = {
        id: asnId,
        worker_id: worker.id,
        pod_id: pod.id,
        role: it.role || "member",
        state: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      tenant.wosAssignments.set(asnId, asn)

      const nextW = { ...worker, assigned_pod: { pod_id: pod.id, role: asn.role, assignment_id: asnId } }
      tenant.wosWorkers.set(worker.id, nextW)

      tenant.wosEvidenceEvents.push({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        ts: new Date().toISOString(),
        action: "wos.scheduler.assign",
        entity_type: "wos.assignment",
        entity_id: asnId,
        snapshot: { assignment: asn, worker: nextW, pod: pod }
      })
    }
  }

  if (!dryRun && planned.length > 0) schedulePersist(tenantId)
  return planned
}

    if (route.name === "admin.evidence.list") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:governance:read")) return
      if (!requireTenantAccess(res, ap.principal, tenantId)) return  // S30
      if (!requireTenantActive(res, tenantId)) return                // S30

      const evidenceResult = adminListEvidence(tenantId, url.searchParams)
      return ok(res, { tenant_id: tenantId, ...evidenceResult })
    }

    // S34: evidence export — ZIP bundle of all data stores ───────────────────
    if (route.name === "admin.evidence.export") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:governance:read")) return

      const exportedAt = nowIso()
      const files = {}

      // manifest
      files["manifest.json"] = Buffer.from(JSON.stringify({
        exported_at:  exportedAt,
        service:      "pro-work",
        version:      SYSTEM_VERSION,
        tenant_count: Object.keys(tenantRegistry).length,
        tenants:      Object.keys(tenantRegistry)
      }, null, 2), "utf8")

      // per-tenant data stores
      for (const [tid, entry] of Object.entries(tenantRegistry)) {
        const pt = String((ap.principal.tenant_id) || "default")
        if (pt !== "*" && pt !== tid) continue  // scope to principal's tenant

        const t = store.tenants.has(tid) ? store.tenants.get(tid) : getTenantStore(tid)
        files[`tenants/${tid}/workers.json`]     = Buffer.from(JSON.stringify(Array.from(t.wosWorkers.entries()),     null, 2), "utf8")
        files[`tenants/${tid}/pods.json`]        = Buffer.from(JSON.stringify(Array.from(t.wosPods.entries()),        null, 2), "utf8")
        files[`tenants/${tid}/assignments.json`] = Buffer.from(JSON.stringify(Array.from(t.wosAssignments.entries()), null, 2), "utf8")
        files[`tenants/${tid}/evidence.json`]    = Buffer.from(JSON.stringify(t.wosEvidenceEvents,                    null, 2), "utf8")
        files[`tenants/${tid}/meta.json`]        = Buffer.from(JSON.stringify(entry, null, 2), "utf8")
      }

      const zipBuf  = buildZip(files)
      const fname   = `prowork-export-${exportedAt.slice(0, 19).replace(/:/g, "-")}.zip`
      res.writeHead(200, {
        "content-type":        "application/zip",
        "content-disposition": `attachment; filename="${fname}"`,
        "content-length":      String(zipBuf.length),
        "cache-control":       "no-store"
      })
      return res.end(zipBuf)
    }
    // ─────────────────────────────────────────────────────────────────────────
    
    if (route.name === "admin.scheduler.status") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)

      if (!requireAdminPerm(res, ap.principal, "admin:governance:read")) return

      return ok(res, { scheduler: wosSchedulerCtlSnapshot() })
    }

    if (route.name === "admin.scheduler.run_once") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)

      if (!requireAdminPerm(res, ap.principal, "admin:wos:assignments:write")) return

      if (wosSchedulerCtl.running) {
        return fail(res, "CONFLICT", "scheduler already running", 409)
      }

      const body = await readJson(req, res)
      if (body === null) return

      const limit = wosSchedulerClampInt(body.limit, 50, 1, 200)
      const dryRun = Boolean(body.dry_run)

      // Evidence: control action on initiating tenant
      try {
        tenant.wosEvidenceEvents.push({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          ts: new Date().toISOString(),
          action: "wos.scheduler.run_once",
          actor: { principal_id: ap.principal && ap.principal.id ? ap.principal.id : null, role: ap.principal && ap.principal.role ? ap.principal.role : null },
          snapshot: { limit, dry_run: dryRun }
        })
      } catch {}

      wosSchedulerCtl.running = true
      wosSchedulerCtl.last_error = null
      const started_at = new Date().toISOString()

      try {
        const allPlanned = []
        for (const tid of Array.from(store.tenants.keys()).sort()) {
          const t = store.tenants.get(tid)
          const planned = runSchedulerForTenant(tid, t, limit, dryRun)
          allPlanned.push(...planned)
          wosSchedulerCtl.tenantStats[tid] = { last_run: new Date().toISOString(), last_error: null }
        }

        const finished_at = new Date().toISOString()
        wosSchedulerCtl.last_run = {
          mode: "run_once",
          dry_run: dryRun,
          limit,
          started_at,
          finished_at,
          planned_count: allPlanned.length
        }

        tenant.wosEvidenceEvents.push({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          ts: new Date().toISOString(),
          action: "wos.scheduler.run",
          snapshot: wosSchedulerCtl.last_run
        })

        wosSchedulerCtl.running = false
        return ok(res, { dry_run: dryRun, planned: allPlanned, scheduler: wosSchedulerCtlSnapshot() })
      } catch (e) {
        wosSchedulerCtl.running = false
        wosSchedulerCtl.last_error = { message: "scheduler run_once failed" }
        return fail(res, "SCHEDULER_ERROR", "scheduler run_once failed", 500)
      }
    }

    if (route.name === "admin.scheduler.interval.start") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)

      if (!requireAdminPerm(res, ap.principal, "admin:wos:assignments:write")) return

      const body = await readJson(req, res)
      if (body === null) return

      const intervalMs = wosSchedulerClampInt(body.interval_ms, 30000, 5000, 3600000)
      const limit = wosSchedulerClampInt(body.limit, 50, 1, 200)
      const dryRun = Boolean(body.dry_run)

      wosSchedulerCtlStopTimer()

      wosSchedulerCtl.enabled = true
      wosSchedulerCtl.interval_ms = intervalMs
      wosSchedulerCtl.last_error = null

      tenant.wosEvidenceEvents.push({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        ts: new Date().toISOString(),
        action: "wos.scheduler.control.start",
        snapshot: { interval_ms: intervalMs, limit, dry_run: dryRun }
      })

      wosSchedulerCtl.timer = setInterval(() => {
        if (wosSchedulerCtl.running) return
        wosSchedulerCtl.running = true
        const started_at = new Date().toISOString()
        try {
          let totalPlanned = 0
          for (const tid of Array.from(store.tenants.keys()).sort()) {
            const t = store.tenants.get(tid)
            try {
              const planned = runSchedulerForTenant(tid, t, limit, dryRun)
              totalPlanned += planned.length
              wosSchedulerCtl.tenantStats[tid] = { last_run: new Date().toISOString(), last_error: null }
            } catch (tenantErr) {
              wosSchedulerCtl.tenantStats[tid] = { last_run: null, last_error: { message: tenantErr && tenantErr.message ? String(tenantErr.message) : "tick failed" } }
            }
          }

          const finished_at = new Date().toISOString()
          wosSchedulerCtl.last_run = {
            mode: "interval",
            dry_run: dryRun,
            interval_ms: intervalMs,
            limit,
            started_at,
            finished_at,
            planned_count: totalPlanned
          }

          wosSchedulerCtl.running = false
        } catch {
          wosSchedulerCtl.running = false
          wosSchedulerCtl.last_error = { message: "scheduler interval tick failed" }
        }
      }, intervalMs)

      return ok(res, { scheduler: wosSchedulerCtlSnapshot() })
    }

    if (route.name === "admin.scheduler.interval.stop") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)

      if (!requireAdminPerm(res, ap.principal, "admin:wos:assignments:write")) return

      wosSchedulerCtlStopTimer()

      tenant.wosEvidenceEvents.push({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        ts: new Date().toISOString(),
        action: "wos.scheduler.control.stop",
        snapshot: {}
      })

      return ok(res, { scheduler: wosSchedulerCtlSnapshot() })
    }
if (route.name === "admin.scheduler.preview") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:workers:read")) return

      const plan = wosSchedulerPlan(tenantId, 100)
      return ok(res, plan)
    }

    if (route.name === "admin.scheduler.run") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:workers:read")) return

      const body = await readJson(req, res)
      if (!body) return

      const dryRun = body.dry_run === true
      const plan = wosSchedulerPlan(tenantId, body.limit || 50)

      if (dryRun || !plan.planned.length) {
        return ok(res, { dry_run: true, ...plan })
      }

      const ts = wosSchedulerNowIso()
      const results = []
      for (const slot of plan.planned) {
        const assignmentId = "asn_" + crypto.randomUUID()
        const evtId = "ev_" + crypto.randomUUID()

        const assignment = {
          id: assignmentId,
          worker_id: slot.worker_id,
          pod_id: slot.pod_id,
          role: slot.role,
          state: "active",
          created_at: ts,
          created_by: "wos_scheduler"
        }

        const worker = tenant.wosWorkers.get(slot.worker_id) || null
        if (worker) {
          const nextWorker = { ...worker, assigned_pod: { pod_id: slot.pod_id, role: slot.role, assigned_at: ts, assignment_id: assignmentId } }
          tenant.wosWorkers.set(slot.worker_id, nextWorker)
        }

        tenant.wosAssignments.set(assignmentId, assignment)

        tenant.wosEvidenceEvents.push({
          id: evtId,
          tenant_id: tenantId,
          at: ts,
          action: "wos.scheduler.assign",
          entity_type: "wos.assignment",
          entity_id: assignmentId,
          snapshot: { assignment, slot }
        })

        results.push(assignment)
      }

      if (typeof wosPersist !== "undefined") wosPersist.markDirty()

      return ok(res, {
        dry_run: false,
        assigned: results.length,
        assignments: results,
        stats: plan.stats
      }, 201)
    }



    if (route.name === "admin.principals.list") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:principals:read")) return
      // S24-C-RBAC
      const auth = ap  // S24-C: authenticated by guard above
      return ok(res, { ...bootMeta(), admin: { id: auth.principal.id, name: auth.principal.name, role: auth.principal.role }, principals: Admin.listPrincipalsSafe(auth.db), roles: auth.db.roles }, 200)
    }

    if (route.name === "admin.principals.create") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:principals:write")) return
      // S24-C-RBAC
      const auth = ap  // S24-C: authenticated by guard above
      const body = await readJson(req, res)
      if (!body) return
      const created = Admin.createPrincipal(auth.db, auth.dbPath, body)
      if (!created.ok) return failFromAdmin(res, created)
      return ok(res, { ...bootMeta(), admin: { id: auth.principal.id, name: auth.principal.name, role: auth.principal.role }, principal: created.principal, token: created.token }, 201)
    }

    // S30: tenant registry ──────────────────────────────────────────────────
    if (route.name === "admin.tenants.list") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:tenants:read")) return
      const tenants = Object.values(tenantRegistry).map(entry => {
        const t = store.tenants.has(entry.tenant_id) ? store.tenants.get(entry.tenant_id) : null
        return {
          ...entry,
          stats: {
            workers:     t ? t.wosWorkers.size          : 0,
            pods:        t ? t.wosPods.size              : 0,
            assignments: t ? t.wosAssignments.size       : 0,
            evidence:    t ? t.wosEvidenceEvents.length  : 0
          }
        }
      })
      return ok(res, { tenants })
    }

    if (route.name === "admin.tenants.create") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:tenants:write")) return
      const body = await readJson(req, res)
      if (!body) return
      const tid = normalizeTenantId(body.tenant_id)
      const name = String(body.name || "").trim()
      if (!assertValidTenantId(res, tid)) return
      if (!name) return fail(res, "VALIDATION_ERROR", "body.name: Field required", 422)
      if (tenantRegistry[tid]) return fail(res, "CONFLICT", `tenant "${tid}" already exists`, 409)
      const entry = { tenant_id: tid, name, status: "active",
        created_at: new Date().toISOString(), notes: String(body.notes || "") }
      tenantRegistry[tid] = entry
      saveTenantRegistry()
      getTenantStore(tid)       // pre-init in-memory store
      Scheduler.trackTenant(tid) // S32: register in scheduler queue
      return ok(res, entry, 201)
    }

    if (route.name === "admin.tenants.get") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:tenants:read")) return
      const tid = route.params.id
      const entry = tenantRegistry[tid]
      if (!entry) return fail(res, "TENANT_NOT_FOUND", `tenant "${tid}" is not registered`, 404)
      const t = store.tenants.has(tid) ? store.tenants.get(tid) : null
      return ok(res, {
        ...entry,
        stats: {
          workers:     t ? t.wosWorkers.size          : 0,
          pods:        t ? t.wosPods.size              : 0,
          assignments: t ? t.wosAssignments.size       : 0,
          evidence:    t ? t.wosEvidenceEvents.length  : 0
        }
      })
    }

    if (route.name === "admin.tenants.disable") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:tenants:write")) return
      if (String(ap.principal.tenant_id || "") !== "*")
        return fail(res, "FORBIDDEN", "only global superadmin can disable tenants", 403)
      const tid = route.params.id
      if (!tenantRegistry[tid]) return fail(res, "TENANT_NOT_FOUND", `tenant "${tid}" is not registered`, 404)
      tenantRegistry[tid] = { ...tenantRegistry[tid], status: "disabled" }
      saveTenantRegistry()
      emitWosEvidenceEvent(tid, {
        actor: ap.principal.name || ap.principal.id,
        action: "tenant.disabled",
        entity_type: "tenant",
        entity_id: tid,
        snapshot: null
      })
      return ok(res, { tenant_id: tid, status: "disabled" })
    }

    if (route.name === "admin.tenants.enable") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:tenants:write")) return
      if (String(ap.principal.tenant_id || "") !== "*")
        return fail(res, "FORBIDDEN", "only global superadmin can enable tenants", 403)
      const tid = route.params.id
      if (!tenantRegistry[tid]) return fail(res, "TENANT_NOT_FOUND", `tenant "${tid}" is not registered`, 404)
      tenantRegistry[tid] = { ...tenantRegistry[tid], status: "active" }
      saveTenantRegistry()
      emitWosEvidenceEvent(tid, {
        actor: ap.principal.name || ap.principal.id,
        action: "tenant.enabled",
        entity_type: "tenant",
        entity_id: tid,
        snapshot: null
      })
      return ok(res, { tenant_id: tid, status: "active" })
    }

    // S32: scheduler engine handlers ────────────────────────────────────────
    if (route.name === "admin.scheduler.get") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:workers:read")) return
      const snap = Scheduler.snapshot()
      // merge registry tenants not yet tracked into the tenants list
      const trackedIds = new Set(snap.tenants.map(t => t.tenant_id))
      const extra = Object.keys(tenantRegistry)
        .filter(id => !trackedIds.has(id))
        .map(id => ({ tenant_id: id, paused: false, paused_at: null, resumed_at: null, last_run: null, last_error: null }))
      return ok(res, { ...snap, tenants: [...snap.tenants, ...extra].sort((a, b) => a.tenant_id.localeCompare(b.tenant_id)) })
    }

    if (route.name === "admin.scheduler.start") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:workers:read")) return
      if (String(ap.principal.tenant_id || "") !== "*")
        return fail(res, "FORBIDDEN", "only global superadmin can start the scheduler", 403)
      const body = await readJson(req, res)
      if (!body) return
      const intervalMs = body && Number.isFinite(Number(body.interval_ms)) ? Number(body.interval_ms) : undefined
      const snap = Scheduler.start(intervalMs)
      emitWosEvidenceEvent("default", {
        actor: ap.principal.name || ap.principal.id,
        action: "scheduler.started", entity_type: "scheduler", entity_id: "global",
        snapshot: { interval_ms: snap.interval_ms }
      })
      return ok(res, snap)
    }

    if (route.name === "admin.scheduler.stop") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:workers:read")) return
      if (String(ap.principal.tenant_id || "") !== "*")
        return fail(res, "FORBIDDEN", "only global superadmin can stop the scheduler", 403)
      const snap = Scheduler.stop()
      emitWosEvidenceEvent("default", {
        actor: ap.principal.name || ap.principal.id,
        action: "scheduler.stopped", entity_type: "scheduler", entity_id: "global",
        snapshot: null
      })
      return ok(res, snap)
    }

    if (route.name === "admin.scheduler.tenant.pause") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:workers:read")) return
      if (String(ap.principal.tenant_id || "") !== "*")
        return fail(res, "FORBIDDEN", "only global superadmin can pause tenant queues", 403)
      const tid = route.params.tenant
      if (!tenantRegistry[tid]) return fail(res, "TENANT_NOT_FOUND", `tenant "${tid}" is not registered`, 404)
      const result = Scheduler.pause(tid)
      emitWosEvidenceEvent(tid, {
        actor: ap.principal.name || ap.principal.id,
        action: "scheduler.tenant.paused", entity_type: "scheduler.tenant", entity_id: tid,
        snapshot: null
      })
      return ok(res, result)
    }

    if (route.name === "admin.scheduler.tenant.resume") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:workers:read")) return
      if (String(ap.principal.tenant_id || "") !== "*")
        return fail(res, "FORBIDDEN", "only global superadmin can resume tenant queues", 403)
      const tid = route.params.tenant
      if (!tenantRegistry[tid]) return fail(res, "TENANT_NOT_FOUND", `tenant "${tid}" is not registered`, 404)
      const result = Scheduler.resume(tid)
      emitWosEvidenceEvent(tid, {
        actor: ap.principal.name || ap.principal.id,
        action: "scheduler.tenant.resumed", entity_type: "scheduler.tenant", entity_id: tid,
        snapshot: null
      })
      return ok(res, result)
    }
    // ────────────────────────────────────────────────────────────────────────

    // S33: analytics handlers ─────────────────────────────────────────────────
    if (route.name === "admin.analytics.list") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:workers:read")) return
      const ids = Object.keys(tenantRegistry)
      const metrics = ids.map(tid => {
        const t = store.tenants.has(tid) ? store.tenants.get(tid) : getTenantStore(tid)
        return Analytics.computeTenantMetrics(tid, t)
      })
      emitWosEvidenceEvent("default", {
        actor: ap.principal.name || ap.principal.id,
        action: "analytics.queried", entity_type: "analytics", entity_id: "global",
        snapshot: { tenant_count: ids.length }
      })
      return ok(res, {
        computed_at: new Date().toISOString(),
        aggregate:   Analytics.aggregateMetrics(metrics),
        tenants:     metrics
      })
    }

    if (route.name === "admin.analytics.tenant") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:workers:read")) return
      const tid = route.params.id
      if (!tenantRegistry[tid]) return fail(res, "TENANT_NOT_FOUND", `tenant "${tid}" is not registered`, 404)
      if (!requireTenantAccess(res, ap.principal, tid)) return
      const t = store.tenants.has(tid) ? store.tenants.get(tid) : getTenantStore(tid)
      const metrics = Analytics.computeTenantMetrics(tid, t)
      emitWosEvidenceEvent(tid, {
        actor: ap.principal.name || ap.principal.id,
        action: "analytics.queried", entity_type: "analytics", entity_id: tid,
        snapshot: { tenant_id: tid }
      })
      return ok(res, metrics)
    }

    if (route.name === "admin.analytics.snapshot") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:workers:read")) return
      const ids = Object.keys(tenantRegistry)
      const metrics = ids.map(tid => {
        const t = store.tenants.has(tid) ? store.tenants.get(tid) : getTenantStore(tid)
        return Analytics.computeTenantMetrics(tid, t)
      })
      const snapshots = Analytics.appendSnapshot(metrics)
      emitWosEvidenceEvent("default", {
        actor: ap.principal.name || ap.principal.id,
        action: "analytics.snapshot.created", entity_type: "analytics.snapshot", entity_id: "global",
        snapshot: { tenant_count: ids.length, snapshot_count: snapshots.length }
      })
      return ok(res, {
        snapshotted_at:  new Date().toISOString(),
        tenant_count:    ids.length,
        snapshot_count:  snapshots.length,
        aggregate:       Analytics.aggregateMetrics(metrics),
        tenants:         metrics
      }, 201)
    }

    if (route.name === "admin.analytics.snapshots") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, "admin:workers:read")) return
      const snapshots = Analytics.loadSnapshots()
      return ok(res, { count: snapshots.length, snapshots })
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Phase 11: permission-bound operational control handlers ─────────────────
    // These are non-destructive governed validation routes.
    // Each action requires explicit permission beyond route-level auth.

    if (route.name === "ops.status") {
      // ops.read — superadmin and ops; Phase 12 audited
      const _auditCtx = { correlation_id: correlationId, request_id: requestId, route: route.name, method: req.method, decision_type: AuthzAudit.DECISION_TYPES.OPS_READ, perm: AdminPerms.PERMS.OPS_STATUS_READ }
      const ap = authenticateAndAudit(req, _auditCtx)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_STATUS_READ, _auditCtx)) return
      return ok(res, {
        phase:        "phase-12",
        permission:   AdminPerms.PERMS.OPS_STATUS_READ,
        actor:        { id: ap.principal.id, role: ap.principal.role },
        status:       "operational",
        correlation_id: correlationId,
        time:         nowIso(),
      })
    }

    if (route.name === "ops.execute") {
      // ops.execute — superadmin and ops; auditor denied; Phase 12 audited
      const _auditCtx = { correlation_id: correlationId, request_id: requestId, route: route.name, method: req.method, decision_type: AuthzAudit.DECISION_TYPES.OPS_EXECUTE, perm: AdminPerms.PERMS.OPS_EXECUTE }
      const ap = authenticateAndAudit(req, _auditCtx)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_EXECUTE, _auditCtx)) return
      return ok(res, {
        phase:          "phase-12",
        permission:     AdminPerms.PERMS.OPS_EXECUTE,
        actor:          { id: ap.principal.id, role: ap.principal.role },
        action:         "execute",
        result:         "accepted",
        correlation_id: correlationId,
        time:           nowIso(),
      }, 202)
    }

    if (route.name === "ops.retry") {
      // ops.retry — superadmin and ops; auditor denied; Phase 12 audited
      const _auditCtx = { correlation_id: correlationId, request_id: requestId, route: route.name, method: req.method, decision_type: AuthzAudit.DECISION_TYPES.OPS_RETRY, perm: AdminPerms.PERMS.OPS_RETRY }
      const ap = authenticateAndAudit(req, _auditCtx)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_RETRY, _auditCtx)) return
      return ok(res, {
        phase:          "phase-12",
        permission:     AdminPerms.PERMS.OPS_RETRY,
        actor:          { id: ap.principal.id, role: ap.principal.role },
        action:         "retry",
        result:         "accepted",
        correlation_id: correlationId,
        time:           nowIso(),
      }, 202)
    }

    if (route.name === "ops.override") {
      // ops.override — superadmin only; Phase 12 audited; Phase 13 approval-bound
      const _auditCtx = { correlation_id: correlationId, request_id: requestId, route: route.name, method: req.method, decision_type: AuthzAudit.DECISION_TYPES.OPS_OVERRIDE, perm: AdminPerms.PERMS.OPS_OVERRIDE }
      const ap = authenticateAndAudit(req, _auditCtx)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE, _auditCtx)) return
      // Phase 14: sovereign registry check
      const _reg14ovr = requireSovereignControl(res, SovereignRegistry.CONTROL_KEYS.OPS_OVERRIDE_REQUIRES_APPROVAL, correlationId)
      if (!_reg14ovr) return
      // Phase 13: approval gate
      const body13 = await readJson(req, res).catch(() => null)
      const aprId  = body13 && body13.approval_request_id ? String(body13.approval_request_id) : null
      if (!aprId) return fail(res, "APPROVAL_REQUIRED", "approval_request_id required for ops.override", 403)
      const aprCheck = ApprovalControl.validateApproval(aprId, ap.principal.id, ApprovalControl.APPROVAL_ACTIONS.OPS_OVERRIDE)
      if (!aprCheck.ok) return fail(res, "APPROVAL_INVALID", `approval denied: ${aprCheck.reason}`, 403)
      ApprovalControl.consumeApproval(aprId, ap.principal.id)
      Logger.info("approval.consumed", { approval_request_id: aprId, actor: ap.principal.id, role: ap.principal.role, action: "ops.override", control_key: _reg14ovr.control_key, control_version: _reg14ovr.control_version, correlation_id: correlationId })
      return ok(res, {
        phase:               "phase-14",
        permission:          AdminPerms.PERMS.OPS_OVERRIDE,
        actor:               { id: ap.principal.id, role: ap.principal.role },
        action:              "override",
        result:              "accepted",
        approval_request_id: aprId,
        control_key:         _reg14ovr.control_key,
        control_version:     _reg14ovr.control_version,
        correlation_id:      correlationId,
        time:                nowIso(),
      }, 202)
    }

    // Phase 13: approval-bound proof routes ───────────────────────────────────
    if (route.name === "approvals.request.create") {
      // POST /api/approvals/request — ops or superadmin can request; auditor denied
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_STATUS_READ)) return
      const body = await readJson(req, res)
      if (!body) return
      const result = ApprovalControl.createApprovalRequest({
        correlation_id:      correlationId,
        request_id:          requestId,
        requester_actor_id:  ap.principal.id,
        requester_role:      ap.principal.role,
        action_type:         body.action_type,
        target_route:        body.target_route || route.name,
        reason:              body.reason || "",
      })
      if (!result.ok) return fail(res, result.error.code, result.error.message, 403)
      ApprovalControl.appendApprovalRequest(result.data)
      Logger.info("approval.request.created", { approval_request_id: result.data.approval_request_id, actor: ap.principal.id, action_type: result.data.action_type, correlation_id: correlationId })
      return ok(res, result.data, 201)
    }

    if (route.name === "approvals.request.approve") {
      // POST /api/approvals/:id/approve — superadmin or eligible approver role
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_STATUS_READ)) return
      const body = await readJson(req, res).catch(() => null)
      const result = ApprovalControl.createApprovalDecision({
        approval_request_id: route.params.id,
        approver_actor_id:   ap.principal.id,
        approver_role:       ap.principal.role,
        decision_outcome:    ApprovalControl.OUTCOMES.APPROVED,
        decision_reason:     (body && body.reason) || "approved",
      })
      if (!result.ok) return fail(res, result.error.code, result.error.message, 403)
      ApprovalControl.appendApprovalDecision(result.data)
      Logger.info("approval.decision.approved", { approval_decision_id: result.data.approval_decision_id, approval_request_id: route.params.id, approver: ap.principal.id, correlation_id: correlationId })
      return ok(res, result.data, 200)
    }

    if (route.name === "approvals.request.deny") {
      // POST /api/approvals/:id/deny
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_STATUS_READ)) return
      const body = await readJson(req, res).catch(() => null)
      const result = ApprovalControl.createApprovalDecision({
        approval_request_id: route.params.id,
        approver_actor_id:   ap.principal.id,
        approver_role:       ap.principal.role,
        decision_outcome:    ApprovalControl.OUTCOMES.DENIED,
        decision_reason:     (body && body.reason) || "denied",
      })
      if (!result.ok) return fail(res, result.error.code, result.error.message, 403)
      ApprovalControl.appendApprovalDecision(result.data)
      Logger.info("approval.decision.denied", { approval_decision_id: result.data.approval_decision_id, approval_request_id: route.params.id, approver: ap.principal.id, correlation_id: correlationId })
      return ok(res, result.data, 200)
    }

    if (route.name === "ops.force_execute") {
      // POST /api/ops/force-execute — ops or superadmin; Phase 14 registry-checked; Phase 13 approval-bound
      const _auditCtx = { correlation_id: correlationId, request_id: requestId, route: route.name, method: req.method, decision_type: AuthzAudit.DECISION_TYPES.OPS_EXECUTE, perm: AdminPerms.PERMS.OPS_EXECUTE }
      const ap = authenticateAndAudit(req, _auditCtx)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_EXECUTE, _auditCtx)) return
      const _reg14fe = requireSovereignControl(res, SovereignRegistry.CONTROL_KEYS.OPS_FORCE_EXECUTE_REQUIRES_APPROVAL, correlationId)
      if (!_reg14fe) return
      const body = await readJson(req, res).catch(() => null)
      const aprId = body && body.approval_request_id ? String(body.approval_request_id) : null
      if (!aprId) return fail(res, "APPROVAL_REQUIRED", "approval_request_id required for ops.force_execute", 403)
      const aprCheck = ApprovalControl.validateApproval(aprId, ap.principal.id, ApprovalControl.APPROVAL_ACTIONS.OPS_FORCE_EXECUTE)
      if (!aprCheck.ok) return fail(res, "APPROVAL_INVALID", `approval denied: ${aprCheck.reason}`, 403)
      ApprovalControl.consumeApproval(aprId, ap.principal.id)
      Logger.info("approval.consumed", { approval_request_id: aprId, actor: ap.principal.id, action: "ops.force_execute", control_key: _reg14fe.control_key, control_version: _reg14fe.control_version, correlation_id: correlationId })
      return ok(res, {
        phase:               "phase-14",
        permission:          AdminPerms.PERMS.OPS_EXECUTE,
        actor:               { id: ap.principal.id, role: ap.principal.role },
        action:              "force_execute",
        result:              "accepted",
        approval_request_id: aprId,
        control_key:         _reg14fe.control_key,
        control_version:     _reg14fe.control_version,
        correlation_id:      correlationId,
        time:                nowIso(),
      }, 202)
    }

    if (route.name === "admin.config_change") {
      // POST /api/admin/config-change — superadmin only; Phase 14 registry-checked; Phase 13 approval-bound
      const _auditCtx = { correlation_id: correlationId, request_id: requestId, route: route.name, method: req.method, decision_type: AuthzAudit.DECISION_TYPES.ADMIN_READ, perm: AdminPerms.PERMS.ADMIN_GOVERNANCE_READ }
      const ap = authenticateAndAudit(req, _auditCtx)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.ADMIN_GOVERNANCE_READ, _auditCtx)) return
      const _reg14cc = requireSovereignControl(res, SovereignRegistry.CONTROL_KEYS.ADMIN_CONFIG_CHANGE_REQUIRES_APPROVAL, correlationId)
      if (!_reg14cc) return
      const body = await readJson(req, res).catch(() => null)
      const aprId = body && body.approval_request_id ? String(body.approval_request_id) : null
      if (!aprId) return fail(res, "APPROVAL_REQUIRED", "approval_request_id required for admin.config_change", 403)
      const aprCheck = ApprovalControl.validateApproval(aprId, ap.principal.id, ApprovalControl.APPROVAL_ACTIONS.ADMIN_CONFIG_CHANGE)
      if (!aprCheck.ok) return fail(res, "APPROVAL_INVALID", `approval denied: ${aprCheck.reason}`, 403)
      ApprovalControl.consumeApproval(aprId, ap.principal.id)
      Logger.info("approval.consumed", { approval_request_id: aprId, actor: ap.principal.id, action: "admin.config_change", control_key: _reg14cc.control_key, control_version: _reg14cc.control_version, correlation_id: correlationId })
      return ok(res, {
        phase:               "phase-14",
        action:              "config_change",
        result:              "accepted",
        approval_request_id: aprId,
        control_key:         _reg14cc.control_key,
        control_version:     _reg14cc.control_version,
        correlation_id:      correlationId,
        time:                nowIso(),
      }, 202)
    }

    // Phase 14: sovereign control registry admin routes ───────────────────────
    if (route.name === "policy.registry.list") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const entries = SovereignRegistry.getRegistry()
      const version = SovereignRegistry.resolveControl(SovereignRegistry.CONTROL_KEYS.SOVEREIGN_REGISTRY_VERSION)
      Logger.info("sovereign.registry.listed", { actor: ap.principal.id, control_count: entries.length, registry_version: SovereignRegistry.REGISTRY_VERSION, correlation_id: correlationId })
      return ok(res, { registry_version: SovereignRegistry.REGISTRY_VERSION, control_count: entries.length, entries, version_control: version.entry || null })
    }

    if (route.name === "policy.registry.export") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const artifact = SovereignRegistry.exportRegistry()
      Logger.info("sovereign.registry.exported", { actor: ap.principal.id, control_count: artifact.control_count, correlation_id: correlationId })
      return ok(res, artifact)
    }

    if (route.name === "policy.registry.disable") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const result = SovereignRegistry.setControlStatus(route.params.key, SovereignRegistry.STATUSES.DISABLED)
      if (!result.ok) return fail(res, "POLICY_CONTROL_ERROR", `cannot disable control: ${result.reason}`, 422)
      Logger.info("sovereign.control.disabled", { actor: ap.principal.id, control_key: route.params.key, correlation_id: correlationId })
      return ok(res, result)
    }

    if (route.name === "policy.registry.enable") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const result = SovereignRegistry.setControlStatus(route.params.key, SovereignRegistry.STATUSES.ACTIVE)
      if (!result.ok) return fail(res, "POLICY_CONTROL_ERROR", `cannot enable control: ${result.reason}`, 422)
      Logger.info("sovereign.control.enabled", { actor: ap.principal.id, control_key: route.params.key, correlation_id: correlationId })
      return ok(res, result)
    }
    // Phase 15: tenant/jurisdiction governance admin routes ──────────────────────
    if (route.name === "tenant.governance.list") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const entries = TenantJurisdiction.getGovernanceState()
      Logger.info("tenant.governance.listed", { actor: ap.principal.id, tenant_count: entries.length, correlation_id: correlationId })
      return ok(res, { tenant_governance_version: TenantJurisdiction.TENANT_GOVERNANCE_VERSION, tenant_count: entries.length, tenants: entries })
    }

    if (route.name === "tenant.governance.export") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const artifact = TenantJurisdiction.exportGovernance()
      Logger.info("tenant.governance.exported", { actor: ap.principal.id, tenant_count: artifact.tenant_count, jurisdiction_count: artifact.jurisdiction_count, correlation_id: correlationId })
      return ok(res, artifact)
    }

    if (route.name === "tenant.governance.jurisdictions") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const jurisdictions = Object.values(TenantJurisdiction.JURISDICTIONS)
      Logger.info("tenant.governance.jurisdictions.listed", { actor: ap.principal.id, jurisdiction_count: jurisdictions.length, correlation_id: correlationId })
      return ok(res, { tenant_governance_version: TenantJurisdiction.TENANT_GOVERNANCE_VERSION, jurisdiction_count: jurisdictions.length, jurisdictions })
    }

    if (route.name === "tenant.governance.set_jurisdiction") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const body = await readJson(req, res).catch(() => null)
      const jurisdictionCode = body && body.jurisdiction_code ? String(body.jurisdiction_code) : null
      if (!jurisdictionCode) return fail(res, "VALIDATION_ERROR", "body.jurisdiction_code required", 422)
      const result = TenantJurisdiction.setTenantJurisdiction(route.params.tenantId, jurisdictionCode, tenantRegistry)
      if (!result.ok) return fail(res, "JURISDICTION_ERROR", `cannot set jurisdiction: ${result.reason}`, 422)
      Logger.info("tenant.governance.jurisdiction.set", { actor: ap.principal.id, tenant_id: route.params.tenantId, jurisdiction_code: jurisdictionCode, correlation_id: correlationId })
      return ok(res, result)
    }

    // Phase 15: governed proof routes — tenant/jurisdiction-gated privileged validators
    if (route.name === "ops.governed_override") {
      // POST /api/ops/governed-override — superadmin; tenant + jurisdiction gated; approval bound
      const _auditCtx = { correlation_id: correlationId, request_id: requestId, route: route.name, method: req.method, decision_type: AuthzAudit.DECISION_TYPES.OPS_OVERRIDE, perm: AdminPerms.PERMS.OPS_OVERRIDE }
      const ap = authenticateAndAudit(req, _auditCtx)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE, _auditCtx)) return
      // Phase 15: tenant governance check
      const requestTenantId   = req.headers["x-tenant-id"] ? String(req.headers["x-tenant-id"]).trim() : null
      const jurisdictionCode  = req.headers["x-jurisdiction-code"] ? String(req.headers["x-jurisdiction-code"]).trim() : null
      if (!requestTenantId) {
        Logger.info("tenant.governance.missing_tenant", { actor: ap.principal.id, correlation_id: correlationId })
        return fail(res, "TENANT_REQUIRED", "X-Tenant-Id header required for governed privileged action", 403)
      }
      const tgResult = requireTenantGovernance(res, String(ap.principal.tenant_id || "*"), requestTenantId, correlationId)
      if (!tgResult) return
      if (!jurisdictionCode) {
        Logger.info("jurisdiction.governance.missing", { tenant_id: requestTenantId, correlation_id: correlationId })
        return fail(res, "JURISDICTION_REQUIRED", "X-Jurisdiction-Code header required for governed privileged action", 403)
      }
      const jResult = requireJurisdictionGovernance(res, jurisdictionCode, tgResult.jurisdiction_code, correlationId)
      if (!jResult) return
      // Phase 14: sovereign registry check
      const _regOvr = requireSovereignControl(res, SovereignRegistry.CONTROL_KEYS.OPS_OVERRIDE_REQUIRES_APPROVAL, correlationId)
      if (!_regOvr) return
      // Phase 13: approval gate
      const body = await readJson(req, res).catch(() => null)
      const aprId = body && body.approval_request_id ? String(body.approval_request_id) : null
      if (!aprId) return fail(res, "APPROVAL_REQUIRED", "approval_request_id required for governed override", 403)
      const aprCheck = ApprovalControl.validateApproval(aprId, ap.principal.id, ApprovalControl.APPROVAL_ACTIONS.OPS_OVERRIDE)
      if (!aprCheck.ok) return fail(res, "APPROVAL_INVALID", `approval denied: ${aprCheck.reason}`, 403)
      ApprovalControl.consumeApproval(aprId, ap.principal.id)
      Logger.info("governed.override.accepted", {
        actor: ap.principal.id, role: ap.principal.role,
        tenant_id: requestTenantId, jurisdiction_code: jurisdictionCode,
        approval_request_id: aprId, control_key: _regOvr.control_key,
        control_version: _regOvr.control_version, correlation_id: correlationId,
      })
      return ok(res, {
        phase:               "phase-15",
        permission:          AdminPerms.PERMS.OPS_OVERRIDE,
        actor:               { id: ap.principal.id, role: ap.principal.role },
        action:              "governed_override",
        result:              "accepted",
        tenant_id:           requestTenantId,
        jurisdiction_code:   jurisdictionCode,
        approval_request_id: aprId,
        control_key:         _regOvr.control_key,
        control_version:     _regOvr.control_version,
        correlation_id:      correlationId,
        time:                nowIso(),
      }, 202)
    }

    if (route.name === "ops.governed_force_execute") {
      // POST /api/ops/governed-force-execute — ops or superadmin; tenant + jurisdiction gated; approval bound
      const _auditCtx = { correlation_id: correlationId, request_id: requestId, route: route.name, method: req.method, decision_type: AuthzAudit.DECISION_TYPES.OPS_EXECUTE, perm: AdminPerms.PERMS.OPS_EXECUTE }
      const ap = authenticateAndAudit(req, _auditCtx)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_EXECUTE, _auditCtx)) return
      // Phase 15: tenant governance check
      const requestTenantId  = req.headers["x-tenant-id"] ? String(req.headers["x-tenant-id"]).trim() : null
      const jurisdictionCode = req.headers["x-jurisdiction-code"] ? String(req.headers["x-jurisdiction-code"]).trim() : null
      if (!requestTenantId) {
        Logger.info("tenant.governance.missing_tenant", { actor: ap.principal.id, correlation_id: correlationId })
        return fail(res, "TENANT_REQUIRED", "X-Tenant-Id header required for governed privileged action", 403)
      }
      const tgResult = requireTenantGovernance(res, String(ap.principal.tenant_id || "*"), requestTenantId, correlationId)
      if (!tgResult) return
      if (!jurisdictionCode) {
        Logger.info("jurisdiction.governance.missing", { tenant_id: requestTenantId, correlation_id: correlationId })
        return fail(res, "JURISDICTION_REQUIRED", "X-Jurisdiction-Code header required for governed privileged action", 403)
      }
      const jResult = requireJurisdictionGovernance(res, jurisdictionCode, tgResult.jurisdiction_code, correlationId)
      if (!jResult) return
      // Phase 14: sovereign registry check
      const _regFe = requireSovereignControl(res, SovereignRegistry.CONTROL_KEYS.OPS_FORCE_EXECUTE_REQUIRES_APPROVAL, correlationId)
      if (!_regFe) return
      // Phase 13: approval gate
      const body = await readJson(req, res).catch(() => null)
      const aprId = body && body.approval_request_id ? String(body.approval_request_id) : null
      if (!aprId) return fail(res, "APPROVAL_REQUIRED", "approval_request_id required for governed force-execute", 403)
      const aprCheck = ApprovalControl.validateApproval(aprId, ap.principal.id, ApprovalControl.APPROVAL_ACTIONS.OPS_FORCE_EXECUTE)
      if (!aprCheck.ok) return fail(res, "APPROVAL_INVALID", `approval denied: ${aprCheck.reason}`, 403)
      ApprovalControl.consumeApproval(aprId, ap.principal.id)
      Logger.info("governed.force_execute.accepted", {
        actor: ap.principal.id, role: ap.principal.role,
        tenant_id: requestTenantId, jurisdiction_code: jurisdictionCode,
        approval_request_id: aprId, control_key: _regFe.control_key,
        control_version: _regFe.control_version, correlation_id: correlationId,
      })
      return ok(res, {
        phase:               "phase-15",
        permission:          AdminPerms.PERMS.OPS_EXECUTE,
        actor:               { id: ap.principal.id, role: ap.principal.role },
        action:              "governed_force_execute",
        result:              "accepted",
        tenant_id:           requestTenantId,
        jurisdiction_code:   jurisdictionCode,
        approval_request_id: aprId,
        control_key:         _regFe.control_key,
        control_version:     _regFe.control_version,
        correlation_id:      correlationId,
        time:                nowIso(),
      }, 202)
    }
    // Phase 16: evidence governance admin routes ─────────────────────────────
    if (route.name === "evidence.governance.list") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const state = EvidenceGovernance.getGovernanceState()
      Logger.info("evidence.governance.listed", { actor: ap.principal.id, residency_region_count: state.regions.length, retention_class_count: state.retention_classes.length, correlation_id: correlationId })
      return ok(res, { evidence_governance_version: EvidenceGovernance.EVIDENCE_GOVERNANCE_VERSION, ...state })
    }

    if (route.name === "evidence.governance.export") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const artifact = EvidenceGovernance.exportGovernance()
      Logger.info("evidence.governance.exported", { actor: ap.principal.id, residency_region_count: artifact.residency_region_count, retention_class_count: artifact.retention_class_count, correlation_id: correlationId })
      return ok(res, artifact)
    }

    if (route.name === "evidence.governance.residency") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const regions = Object.values(EvidenceGovernance.RESIDENCY_REGIONS)
      Logger.info("evidence.governance.residency.listed", { actor: ap.principal.id, count: regions.length, correlation_id: correlationId })
      return ok(res, { evidence_governance_version: EvidenceGovernance.EVIDENCE_GOVERNANCE_VERSION, residency_region_count: regions.length, residency_regions: regions })
    }

    if (route.name === "evidence.governance.retention") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const state = EvidenceGovernance.getGovernanceState()
      Logger.info("evidence.governance.retention.listed", { actor: ap.principal.id, count: state.retention_classes.length, correlation_id: correlationId })
      return ok(res, { evidence_governance_version: EvidenceGovernance.EVIDENCE_GOVERNANCE_VERSION, retention_class_count: state.retention_classes.length, retention_classes: state.retention_classes })
    }

    if (route.name === "evidence.governance.retention.disable") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const result = EvidenceGovernance.setRetentionStatus(route.params.retentionClass, "inactive")
      if (!result.ok) return fail(res, "RETENTION_ERROR", `cannot disable retention class: ${result.reason}`, 422)
      Logger.info("evidence.governance.retention.disabled", { actor: ap.principal.id, retention_class: route.params.retentionClass, correlation_id: correlationId })
      return ok(res, result)
    }

    if (route.name === "evidence.governance.retention.enable") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const result = EvidenceGovernance.setRetentionStatus(route.params.retentionClass, "active")
      if (!result.ok) return fail(res, "RETENTION_ERROR", `cannot enable retention class: ${result.reason}`, 422)
      Logger.info("evidence.governance.retention.enabled", { actor: ap.principal.id, retention_class: route.params.retentionClass, correlation_id: correlationId })
      return ok(res, result)
    }

    // Phase 16: governed evidence write proof route — residency + retention gated
    if (route.name === "ops.governed_evidence_write") {
      // POST /api/ops/governed-evidence-write — ops or superadmin; tenant + jurisdiction + residency + retention gated
      const _auditCtx = { correlation_id: correlationId, request_id: requestId, route: route.name, method: req.method, decision_type: AuthzAudit.DECISION_TYPES.OPS_EXECUTE, perm: AdminPerms.PERMS.OPS_EXECUTE }
      const ap = authenticateAndAudit(req, _auditCtx)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_EXECUTE, _auditCtx)) return
      // Phase 15: tenant/jurisdiction check
      const requestTenantId  = req.headers["x-tenant-id"]       ? String(req.headers["x-tenant-id"]).trim()       : null
      const jurisdictionCode = req.headers["x-jurisdiction-code"] ? String(req.headers["x-jurisdiction-code"]).trim() : null
      if (!requestTenantId) return fail(res, "TENANT_REQUIRED", "X-Tenant-Id required for governed evidence write", 403)
      const tgResult = requireTenantGovernance(res, String(ap.principal.tenant_id || "*"), requestTenantId, correlationId)
      if (!tgResult) return
      if (!jurisdictionCode) return fail(res, "JURISDICTION_REQUIRED", "X-Jurisdiction-Code required for governed evidence write", 403)
      const jResult = requireJurisdictionGovernance(res, jurisdictionCode, tgResult.jurisdiction_code, correlationId)
      if (!jResult) return
      // Phase 16: residency check
      const residencyRegion = req.headers["x-residency-region"] ? String(req.headers["x-residency-region"]).trim() : null
      if (!residencyRegion) {
        Logger.info("residency.governance.missing", { tenant_id: requestTenantId, correlation_id: correlationId })
        return fail(res, "RESIDENCY_REQUIRED", "X-Residency-Region required for governed evidence write", 403)
      }
      const rResult = requireResidencyGovernance(res, residencyRegion, jurisdictionCode, correlationId)
      if (!rResult) return
      // Phase 16: retention check
      const retentionClass = req.headers["x-retention-class"] ? String(req.headers["x-retention-class"]).trim() : null
      if (!retentionClass) {
        Logger.info("retention.governance.missing", { tenant_id: requestTenantId, correlation_id: correlationId })
        return fail(res, "RETENTION_REQUIRED", "X-Retention-Class required for governed evidence write", 403)
      }
      const rcResult = requireRetentionGovernance(res, retentionClass, correlationId)
      if (!rcResult) return
      Logger.info("governed.evidence.write.accepted", {
        actor: ap.principal.id, role: ap.principal.role,
        tenant_id: requestTenantId, jurisdiction_code: jurisdictionCode,
        residency_region: residencyRegion, retention_class: retentionClass,
        retention_days: rcResult.entry.retention_days,
        correlation_id: correlationId,
      })
      return ok(res, {
        phase:             "phase-16",
        permission:        AdminPerms.PERMS.OPS_EXECUTE,
        actor:             { id: ap.principal.id, role: ap.principal.role },
        action:            "governed_evidence_write",
        result:            "accepted",
        tenant_id:         requestTenantId,
        jurisdiction_code: jurisdictionCode,
        residency_region:  residencyRegion,
        retention_class:   retentionClass,
        retention_days:    rcResult.entry.retention_days,
        correlation_id:    correlationId,
        time:              nowIso(),
      }, 202)
    }
    // Phase 17: disclosure governance admin routes ─────────────────────────────
    if (route.name === "disclosure.governance.list") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const state = DisclosureLegalHold.getGovernanceState()
      Logger.info("disclosure.governance.listed", { actor: ap.principal.id, basis_count: state.bases.length, scope_count: state.scopes.length, hold_count: state.legal_holds.length, correlation_id: correlationId })
      return ok(res, { disclosure_governance_version: DisclosureLegalHold.DISCLOSURE_GOVERNANCE_VERSION, ...state })
    }

    if (route.name === "disclosure.governance.export") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const artifact = DisclosureLegalHold.exportGovernance()
      Logger.info("disclosure.governance.exported", { actor: ap.principal.id, basis_count: artifact.disclosure_basis_count, scope_count: artifact.disclosure_scope_count, hold_count: artifact.legal_hold_count, correlation_id: correlationId })
      return ok(res, artifact)
    }

    if (route.name === "disclosure.governance.bases") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const bases = Object.values(DisclosureLegalHold.DISCLOSURE_BASES)
      Logger.info("disclosure.governance.bases.listed", { actor: ap.principal.id, count: bases.length, correlation_id: correlationId })
      return ok(res, { disclosure_governance_version: DisclosureLegalHold.DISCLOSURE_GOVERNANCE_VERSION, disclosure_basis_count: bases.length, disclosure_bases: bases })
    }

    if (route.name === "disclosure.governance.legal_holds") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const state = DisclosureLegalHold.getGovernanceState()
      Logger.info("disclosure.governance.legal_holds.listed", { actor: ap.principal.id, count: state.legal_holds.length, correlation_id: correlationId })
      return ok(res, { disclosure_governance_version: DisclosureLegalHold.DISCLOSURE_GOVERNANCE_VERSION, legal_hold_count: state.legal_holds.length, legal_holds: state.legal_holds })
    }

    if (route.name === "disclosure.governance.legal_hold.create") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const body = await readJson(req, res).catch(() => null)
      if (!body) return fail(res, "INVALID_BODY", "JSON body required", 400)
      const result = DisclosureLegalHold.createLegalHold({ tenantId: body.tenant_id, scope: body.scope, note: body.note })
      if (!result.ok) return fail(res, "LEGAL_HOLD_ERROR", `cannot create legal hold: ${result.reason}`, 422)
      Logger.info("disclosure.governance.legal_hold.created", { actor: ap.principal.id, legal_hold_id: result.data.legal_hold_id, tenant_id: result.data.tenant_id, correlation_id: correlationId })
      return ok(res, result.data, 201)
    }

    if (route.name === "disclosure.governance.legal_hold.release") {
      const ap = Admin.authenticate(req)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_OVERRIDE)) return
      const result = DisclosureLegalHold.releaseLegalHold(route.params.holdId)
      if (!result.ok) return fail(res, "LEGAL_HOLD_ERROR", `cannot release legal hold: ${result.reason}`, 422)
      Logger.info("disclosure.governance.legal_hold.released", { actor: ap.principal.id, legal_hold_id: route.params.holdId, correlation_id: correlationId })
      return ok(res, result.data)
    }

    // Phase 17: governed disclosure proof route — disclosure basis + scope gated
    if (route.name === "ops.governed_disclosure") {
      const _auditCtx = { correlation_id: correlationId, request_id: requestId, route: route.name, method: req.method, decision_type: AuthzAudit.DECISION_TYPES.OPS_EXECUTE, perm: AdminPerms.PERMS.OPS_EXECUTE }
      const ap = authenticateAndAudit(req, _auditCtx)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_EXECUTE, _auditCtx)) return
      const disclosureBasis = req.headers["x-disclosure-basis"] ? String(req.headers["x-disclosure-basis"]).trim() : null
      const disclosureScope = req.headers["x-disclosure-scope"] ? String(req.headers["x-disclosure-scope"]).trim() : null
      if (!disclosureBasis) {
        Logger.info("disclosure.governance.missing_basis", { actor: ap.principal.id, correlation_id: correlationId })
        return fail(res, "DISCLOSURE_REQUIRED", "X-Disclosure-Basis header required for governed disclosure", 403)
      }
      const dResult = requireDisclosureGovernance(res, disclosureBasis, disclosureScope || "", correlationId)
      if (!dResult) return
      Logger.info("governed.disclosure.accepted", {
        actor: ap.principal.id, role: ap.principal.role,
        disclosure_basis: disclosureBasis, disclosure_scope: disclosureScope,
        correlation_id: correlationId,
      })
      return ok(res, {
        phase:            "phase-17",
        permission:       AdminPerms.PERMS.OPS_EXECUTE,
        actor:            { id: ap.principal.id, role: ap.principal.role },
        action:           "governed_disclosure",
        result:           "accepted",
        disclosure_basis: disclosureBasis,
        disclosure_scope: disclosureScope,
        correlation_id:   correlationId,
        time:             nowIso(),
      }, 202)
    }

    // Phase 17: governed disposal proof route — legal hold state gated
    if (route.name === "ops.governed_disposal") {
      const _auditCtx = { correlation_id: correlationId, request_id: requestId, route: route.name, method: req.method, decision_type: AuthzAudit.DECISION_TYPES.OPS_EXECUTE, perm: AdminPerms.PERMS.OPS_EXECUTE }
      const ap = authenticateAndAudit(req, _auditCtx)
      if (!ap.ok) return failFromAdmin(res, ap)
      if (!requireAdminPerm(res, ap.principal, AdminPerms.PERMS.OPS_EXECUTE, _auditCtx)) return
      const requestTenantId  = req.headers["x-tenant-id"] ? String(req.headers["x-tenant-id"]).trim() : null
      const declaredHoldState = req.headers["x-legal-hold-state"] ? String(req.headers["x-legal-hold-state"]).trim() : null
      if (!requestTenantId) return fail(res, "TENANT_REQUIRED", "X-Tenant-Id required for governed disposal", 403)
      if (!declaredHoldState) {
        Logger.info("legal.hold.state.missing", { actor: ap.principal.id, correlation_id: correlationId })
        return fail(res, "LEGAL_HOLD_STATE_REQUIRED", "X-Legal-Hold-State header required for governed disposal", 403)
      }
      const hsCheck = DisclosureLegalHold.validateLegalHoldState(declaredHoldState)
      Logger.info("legal.hold.state.validated", {
        tenant_id: requestTenantId, legal_hold_state: declaredHoldState, ok: hsCheck.ok,
        reason: hsCheck.reason || "known_state", correlation_id: correlationId,
      })
      if (!hsCheck.ok) {
        return fail(res, "LEGAL_HOLD_STATE_DENIED", `legal hold state check failed: ${hsCheck.reason}`, 403)
      }
      const holdClear = requireLegalHoldClear(res, requestTenantId, correlationId)
      if (!holdClear) return
      Logger.info("governed.disposal.accepted", {
        actor: ap.principal.id, role: ap.principal.role,
        tenant_id: requestTenantId, legal_hold_state: declaredHoldState,
        correlation_id: correlationId,
      })
      return ok(res, {
        phase:            "phase-17",
        permission:       AdminPerms.PERMS.OPS_EXECUTE,
        actor:            { id: ap.principal.id, role: ap.principal.role },
        action:           "governed_disposal",
        result:           "accepted",
        tenant_id:        requestTenantId,
        legal_hold_state: declaredHoldState,
        correlation_id:   correlationId,
        time:             nowIso(),
      }, 202)
    }
    // ─────────────────────────────────────────────────────────────────────────

    return methodNotAllowed(res)
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "Unhandled error"
    return fail(res, "INTERNAL_ERROR", msg, 500)
  }
})

loadAllTenants()
loadTenantRegistry()
ApprovalControl.loadState()   // Phase 13: hydrate approval state from JSONL
SovereignRegistry.loadRegistry()  // Phase 14: load sovereign control registry
TenantJurisdiction.initTenantGovernance(tenantRegistry)  // Phase 15: initialize tenant/jurisdiction governance

// S34: init scheduler engine — wired to SchedulerJobs.runForTenant
Scheduler.init({
  getActiveTenants: () => Array.from(store.tenants.keys()),
  runForTenant: (tid) => {
    if (!isTenantActive(tid)) return
    const t = getTenantStore(tid)
    const result = SchedulerJobs.runForTenant(tid, t)
    if (result.assigned > 0) schedulePersist(tid)
  }
})
Scheduler.start()

server.listen(PORT, HOST, () => {
  console.log(`server running: http://${HOST}:${PORT}`)
})
