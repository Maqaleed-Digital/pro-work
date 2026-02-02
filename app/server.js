"use strict"

const http = require("http")
const { URL } = require("url")
const crypto = require("crypto")

const HOST = process.env.APP_HOST || "127.0.0.1"
const PORT = Number(process.env.APP_PORT || "3010")

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

async function readJson(req, res) {
  const ct = String(req.headers["content-type"] || "").toLowerCase()
  if (!ct.includes("application/json")) {
    fail(res, "UNSUPPORTED_MEDIA_TYPE", "content-type must be application/json", 415)
    return null
  }

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
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
  wosWorkers: new Map(),
  wosEvidenceEvents: []
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

  const ruleProposalAcceptedRequired =
    String(ci.status) === "sent" || String(ci.status) === "accepted"

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

function emitWosEvidenceEvent(input) {
  const id = genId("ev")
  const evt = {
    id,
    actor: String(input.actor || "system"),
    action: String(input.action),
    entity_type: String(input.entity_type),
    entity_id: String(input.entity_id),
    timestamp: nowIso(),
    snapshot: input.snapshot === undefined ? null : input.snapshot
  }
  store.wosEvidenceEvents.push(evt)
  return evt
}

function listWosEvidenceEvents() {
  return store.wosEvidenceEvents.slice()
}

function createWosWorker(input, actor) {
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

  if (input.skills !== undefined && !Array.isArray(input.skills)) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.skills: Must be an array" }, status: 422 }
  }

  const skills = []
  if (Array.isArray(input.skills)) {
    for (let i = 0; i < input.skills.length; i++) {
      const v = String(input.skills[i] === undefined || input.skills[i] === null ? "" : input.skills[i]).trim()
      if (v) skills.push(v)
    }
  }

  const availability = input.availability === undefined || input.availability === null ? {} : input.availability
  if (input.availability !== undefined && (typeof availability !== "object" || Array.isArray(availability))) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.availability: Must be an object" }, status: 422 }
  }

  let hoursPerWeek = null
  if (availability.hours_per_week !== undefined && availability.hours_per_week !== null) {
    const n = Number(availability.hours_per_week)
    if (!Number.isFinite(n) || n < 0 || n > 168) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.availability.hours_per_week: Must be between 0 and 168" }, status: 422 }
    }
    hoursPerWeek = n
  }

  const allocationNote =
    availability.allocation_note === undefined || availability.allocation_note === null
      ? null
      : String(availability.allocation_note).trim()
  if (allocationNote !== null && allocationNote === "") {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.availability.allocation_note: Must be a non-empty string or null" }, status: 422 }
  }

  const status = input.status === undefined || input.status === null ? "active" : String(input.status).trim()
  if (!status) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.status: Must be a non-empty string or null" }, status: 422 }
  }

  const id = genId("wkr")
  const t = nowIso()
  const worker = {
    id,
    type,
    display_name: displayName,
    email,
    skills,
    availability: {
      hours_per_week: hoursPerWeek,
      allocation_note: allocationNote
    },
    status,
    created_at: t,
    updated_at: t
  }

  store.wosWorkers.set(id, worker)

  emitWosEvidenceEvent({
    actor,
    action: "wos.worker.create",
    entity_type: "wos.worker",
    entity_id: id,
    snapshot: worker
  })

  return { ok: true, data: worker }
}

function getWosWorker(id) {
  return store.wosWorkers.get(id) || null
}

function patchWosWorker(id, patch, actor) {
  const current = getWosWorker(id)
  if (!current) return { ok: false, error: { code: "NOT_FOUND", message: "Worker not found" }, status: 404 }

  const next = { ...current }
  let changed = false

  if (patch.type !== undefined) {
    const type = String(patch.type || "").trim()
    if (!isWorkerType(type)) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.type: Must be 'FTE' or 'FREELANCER'" }, status: 422 }
    }
    next.type = type
    changed = true
  }

  if (patch.display_name !== undefined) {
    const dn = String(patch.display_name || "").trim()
    if (!dn) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.display_name: Must be a non-empty string" }, status: 422 }
    }
    next.display_name = dn
    changed = true
  }

  if (patch.email !== undefined) {
    const email = patch.email === null ? null : String(patch.email).trim()
    if (email !== null && email === "") {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.email: Must be a non-empty string or null" }, status: 422 }
    }
    next.email = email
    changed = true
  }

  if (patch.skills !== undefined) {
    if (!Array.isArray(patch.skills)) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.skills: Must be an array" }, status: 422 }
    }
    const out = []
    for (let i = 0; i < patch.skills.length; i++) {
      const v = String(patch.skills[i] === undefined || patch.skills[i] === null ? "" : patch.skills[i]).trim()
      if (v) out.push(v)
    }
    next.skills = out
    changed = true
  }

  if (patch.availability !== undefined) {
    if (patch.availability === null) {
      next.availability = { hours_per_week: null, allocation_note: null }
      changed = true
    } else if (typeof patch.availability !== "object" || Array.isArray(patch.availability)) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.availability: Must be an object or null" }, status: 422 }
    } else {
      const a = { ...(next.availability || { hours_per_week: null, allocation_note: null }) }
      if (patch.availability.hours_per_week !== undefined) {
        if (patch.availability.hours_per_week === null) {
          a.hours_per_week = null
        } else {
          const n = Number(patch.availability.hours_per_week)
          if (!Number.isFinite(n) || n < 0 || n > 168) {
            return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.availability.hours_per_week: Must be between 0 and 168" }, status: 422 }
          }
          a.hours_per_week = n
        }
      }
      if (patch.availability.allocation_note !== undefined) {
        if (patch.availability.allocation_note === null) {
          a.allocation_note = null
        } else {
          const s = String(patch.availability.allocation_note).trim()
          if (!s) {
            return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.availability.allocation_note: Must be a non-empty string or null" }, status: 422 }
          }
          a.allocation_note = s
        }
      }
      next.availability = a
      changed = true
    }
  }

  if (patch.status !== undefined) {
    const st = patch.status === null ? null : String(patch.status).trim()
    if (st !== null && st === "") {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "body.status: Must be a non-empty string or null" }, status: 422 }
    }
    next.status = st === null ? next.status : st
    changed = true
  }

  if (!changed) {
    return { ok: true, data: current }
  }

  next.updated_at = nowIso()
  store.wosWorkers.set(id, next)

  emitWosEvidenceEvent({
    actor,
    action: "wos.worker.update",
    entity_type: "wos.worker",
    entity_id: id,
    snapshot: next
  })

  return { ok: true, data: next }
}

function listWosWorkersQuery(query) {
  const allowed = new Set(["type", "status", "skill", "limit", "cursor"])
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

  let items = Array.from(store.wosWorkers.values())

  if (type && String(type).trim() !== "") {
    items = items.filter(w => String(w.type) === String(type))
  }
  if (status && String(status).trim() !== "") {
    items = items.filter(w => String(w.status) === String(status))
  }
  if (skill && String(skill).trim() !== "") {
    items = items.filter(w => Array.isArray(w.skills) && w.skills.includes(String(skill)))
  }

  items.sort((a, b) => {
    const aa = String(a.created_at || "")
    const bb = String(b.created_at || "")
    if (aa === bb) return 0
    return aa > bb ? -1 : 1
  })

  if (cursor && String(cursor).trim() !== "") {
    items = items.filter(w => String(w.created_at || "") < String(cursor))
  }

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

function createManualWosEvidenceEvent(input) {
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

  const evt = emitWosEvidenceEvent({
    actor,
    action,
    entity_type: entityType,
    entity_id: entityId,
    snapshot: input.snapshot === undefined ? null : input.snapshot
  })

  return { ok: true, data: evt }
}

function matchRoute(method, pathname) {
  const m = method.toUpperCase()

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

  const wosWorkerGetMatch = pathname.match(/^\/api\/wos\/workers\/([^/]+)$/)
  if (m === "GET" && wosWorkerGetMatch) return { name: "wos.workers.get", params: { id: wosWorkerGetMatch[1] } }
  if (m === "PATCH" && wosWorkerGetMatch) return { name: "wos.workers.patch", params: { id: wosWorkerGetMatch[1] } }

  if (m === "GET" && pathname === "/api/wos/evidence-events") return { name: "wos.evidence.list", params: {} }
  if (m === "POST" && pathname === "/api/wos/evidence-events") return { name: "wos.evidence.create", params: {} }

  return null
}

function notFound(res) {
  fail(res, "NOT_FOUND", "Route not found", 404)
}

function methodNotAllowed(res) {
  fail(res, "METHOD_NOT_ALLOWED", "Method not allowed", 405)
}

function health(res) {
  ok(res, { service: "pro-work", health: "ok", time: nowIso() }, 200)
}

function invalidState(res, message) {
  fail(res, "INVALID_STATE", message, 409)
}

function actorFromReq(req) {
  const h = req.headers["x-actor"]
  const actor = h === undefined || h === null ? "" : String(h).trim()
  return actor || "user"
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || HOST}`)
    const pathname = url.pathname

    if (req.method === "GET" && pathname === "/health") return health(res)

    const route = matchRoute(req.method || "GET", pathname)
    if (!route) return notFound(res)

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

    if (route.name === "jobs.list") {
      return ok(res, listJobs(), 200)
    }

    if (route.name === "jobs.get") {
      const job = getJob(route.params.job_id)
      if (!job) return fail(res, "NOT_FOUND", "Job not found", 404)
      return ok(res, job, 200)
    }

    if (route.name === "jobs.close") {
      await readJson(req, res).catch(() => null)
      const job = getJob(route.params.job_id)
      if (!job) return fail(res, "NOT_FOUND", "Job not found", 404)
      if (job.status !== "open") {
        return invalidState(res, `Cannot close job in '${job.status}' status. Job must be 'open'`)
      }
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

      const proposal = createProposal(jobId, {
        freelancer_name: body.freelancer_name,
        price,
        message: body.message
      })
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
      if (job.status !== "open") {
        return invalidState(res, `Cannot accept proposals for job in '${job.status}' status. Job must be 'open'`)
      }

      const proposal = getProposal(proposalId)
      if (!proposal) return fail(res, "NOT_FOUND", "Proposal not found", 404)
      if (proposal.job_id !== jobId) {
        return fail(res, "VALIDATION_ERROR", "proposal_id does not belong to job_id", 422)
      }
      if (proposal.status !== "pending") {
        return invalidState(res, `Cannot accept proposal in '${proposal.status}' status. Proposal must be 'pending'`)
      }

      const accepted = updateProposal(proposal, { status: "accepted" })

      const all = listProposals(jobId)
      for (const p of all) {
        if (p.id !== accepted.id && p.status === "pending") {
          updateProposal(p, { status: "rejected" })
        }
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
      if (job.status !== "open") {
        return invalidState(res, `Cannot reject proposals for job in '${job.status}' status. Job must be 'open'`)
      }

      const proposal = getProposal(proposalId)
      if (!proposal) return fail(res, "NOT_FOUND", "Proposal not found", 404)
      if (proposal.job_id !== jobId) {
        return fail(res, "VALIDATION_ERROR", "proposal_id does not belong to job_id", 422)
      }
      if (proposal.status !== "pending") {
        return invalidState(res, `Cannot reject proposal in '${proposal.status}' status. Proposal must be 'pending'`)
      }

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
      if (String(proposal.job_id) !== String(body.job_id)) {
        return fail(res, "VALIDATION_ERROR", "proposal_id does not belong to job_id", 422)
      }

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
      const audit = buildContractIntentAudit(ci)
      return ok(res, audit, 200)
    }

    if (route.name === "contracts.intent.send") {
      await readJson(req, res).catch(() => null)
      const ci = getContractIntent(route.params.id)
      if (!ci) return fail(res, "NOT_FOUND", "Contract intent not found", 404)
      if (ci.status !== "draft") {
        return invalidState(res, `Cannot send contract intent in '${ci.status}' status. Must be 'draft'`)
      }

      const proposal = getProposal(ci.proposal_id)
      if (!proposal) return fail(res, "NOT_FOUND", "Proposal not found", 404)
      if (proposal.status !== "accepted") {
        return invalidState(res, "Cannot send contract intent because proposal is not accepted")
      }

      const sent = updateContractIntent(ci, { status: "sent" })
      return ok(res, sent, 200)
    }

    if (route.name === "contracts.intent.accept") {
      await readJson(req, res).catch(() => null)
      const ci = getContractIntent(route.params.id)
      if (!ci) return fail(res, "NOT_FOUND", "Contract intent not found", 404)
      if (ci.status !== "sent") {
        return invalidState(res, `Cannot accept contract intent in '${ci.status}' status. Must be 'sent'`)
      }

      const proposal = getProposal(ci.proposal_id)
      if (!proposal) return fail(res, "NOT_FOUND", "Proposal not found", 404)
      if (proposal.status !== "accepted") {
        return invalidState(res, "Cannot accept contract intent because proposal is not accepted")
      }

      const accepted = updateContractIntent(ci, { status: "accepted" })
      return ok(res, accepted, 200)
    }

    if (route.name === "wos.workers.create") {
      const body = await readJson(req, res)
      if (!body) return
      const actor = actorFromReq(req)
      const out = createWosWorker(body, actor)
      if (!out.ok) return fail(res, out.error.code, out.error.message, out.status || 422)
      return ok(res, out.data, 201)
    }

    if (route.name === "wos.workers.list") {
      const out = listWosWorkersQuery(url.searchParams)
      if (!out.ok) return fail(res, out.error.code, out.error.message, out.status || 422)
      return ok(res, out.data, 200)
    }

    if (route.name === "wos.workers.get") {
      const w = getWosWorker(route.params.id)
      if (!w) return fail(res, "NOT_FOUND", "Worker not found", 404)
      return ok(res, w, 200)
    }

    if (route.name === "wos.workers.patch") {
      const body = await readJson(req, res)
      if (!body) return
      const actor = actorFromReq(req)
      const out = patchWosWorker(route.params.id, body, actor)
      if (!out.ok) return fail(res, out.error.code, out.error.message, out.status || 422)
      return ok(res, out.data, 200)
    }

    if (route.name === "wos.evidence.list") {
      return ok(res, listWosEvidenceEvents(), 200)
    }

    if (route.name === "wos.evidence.create") {
      const body = await readJson(req, res)
      if (!body) return
      const out = createManualWosEvidenceEvent(body)
      if (!out.ok) return fail(res, out.error.code, out.error.message, out.status || 422)
      return ok(res, out.data, 201)
    }

    return methodNotAllowed(res)
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "Unhandled error"
    return fail(res, "INTERNAL_ERROR", msg, 500)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`server running: http://${HOST}:${PORT}`)
})
