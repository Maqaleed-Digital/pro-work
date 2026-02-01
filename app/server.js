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
  contractIntents: new Map()
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

  const ciGetMatch = pathname.match(/^\/api\/contracts\/intent\/([^/]+)$/)
  if (m === "GET" && ciGetMatch) return { name: "contracts.intent.get", params: { id: ciGetMatch[1] } }

  const ciSendMatch = pathname.match(/^\/api\/contracts\/intent\/([^/]+)\/send$/)
  if (m === "POST" && ciSendMatch) return { name: "contracts.intent.send", params: { id: ciSendMatch[1] } }

  const ciAcceptMatch = pathname.match(/^\/api\/contracts\/intent\/([^/]+)\/accept$/)
  if (m === "POST" && ciAcceptMatch) return { name: "contracts.intent.accept", params: { id: ciAcceptMatch[1] } }

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

    return methodNotAllowed(res)
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "Unhandled error"
    return fail(res, "INTERNAL_ERROR", msg, 500)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`server running: http://${HOST}:${PORT}`)
})
