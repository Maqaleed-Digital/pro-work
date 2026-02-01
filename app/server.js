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

function matchRoute(method, pathname) {
  const m = method.toUpperCase()

  if (m === "POST" && pathname === "/api/jobs") return { name: "jobs.create", params: {} }
  if (m === "GET" && pathname === "/api/jobs") return { name: "jobs.list", params: {} }

  const jobIdMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/)
  if (m === "GET" && jobIdMatch) return { name: "jobs.get", params: { job_id: jobIdMatch[1] } }

  const proposalsMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/proposals$/)
  if (m === "POST" && proposalsMatch) return { name: "proposals.create", params: { job_id: proposalsMatch[1] } }
  if (m === "GET" && proposalsMatch) return { name: "proposals.list", params: { job_id: proposalsMatch[1] } }

  if (m === "POST" && pathname === "/api/contracts/intent") return { name: "contracts.intent", params: {} }

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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || HOST}`)
    const pathname = url.pathname

    if (req.method === "GET" && pathname === "/health") return health(res)

    const route = matchRoute(req.method || "GET", pathname)
    if (!route) {
      if (pathname.startsWith("/api/")) return notFound(res)
      return notFound(res)
    }

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

    if (route.name === "contracts.intent") {
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

    return methodNotAllowed(res)
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "Unhandled error"
    return fail(res, "INTERNAL_ERROR", msg, 500)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`server running: http://${HOST}:${PORT}`)
})
