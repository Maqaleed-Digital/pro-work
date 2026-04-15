import { apiGet, getTenant } from "../api.js"
import { toast } from "../components/toast.js"

const TOKEN_ICON = {
  PROJECT_COMPLETION_TOKEN:      "🏆",
  PHR_APPROVAL_TOKEN:            "✅",
  COMPLIANCE_VERIFICATION_TOKEN: "🔒",
  TEAM_LEADERSHIP_TOKEN:         "👑",
}

const HEALTH_CLS  = { STRONG: "pass", BUILDING: "warn", UNVERIFIED: "pending" }
const REL_ICON    = {
  WORKED_WITH:        "🤝",
  LED_TEAM:           "👑",
  COMPLETED_PROJECT:  "🏆",
  APPROVED_OUTPUT:    "✅",
  PASSED_COMPLIANCE:  "🔒",
}

function kpi(label, val, sub, cls) {
  const d = document.createElement("div")
  d.className = "kpi-card " + (cls || "")
  d.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value">${val}</div><div class="kpi-sub">${sub}</div>`
  return d
}

function tokenBadge(type) {
  const icon  = TOKEN_ICON[type] || "🪙"
  const short = type.replace(/_TOKEN$/, "").replace(/_/g, " ")
  return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:8px;background:var(--bg);border:1px solid var(--border)">${icon} ${short}</span>`
}

function workerIdentityRow(worker, eri, tokens, edges) {
  const tokenCount = tokens.length
  const health     = worker.identity_health || (tokenCount >= 2 ? "STRONG" : tokenCount === 1 ? "BUILDING" : "UNVERIFIED")
  const eriScore   = eri ? eri.eri_score : 0
  const eriCls     = eriScore >= 50 ? "var(--red)" : eriScore >= 25 ? "var(--amber)" : "var(--green)"
  const byType     = {}
  tokens.forEach(t => { byType[t.token_type] = (byType[t.token_type] || 0) + 1 })

  const tr = document.createElement("tr")
  tr.innerHTML = `
    <td>
      <div style="font-weight:600;font-size:13px">${worker.name || worker.id}</div>
      <div style="font-size:11px;color:var(--muted);font-family:monospace">${worker.id}</div>
    </td>
    <td>
      <span style="font-size:11px;background:var(--bg);padding:2px 8px;border-radius:6px;border:1px solid var(--border)">${worker.worker_type || "—"}</span>
    </td>
    <td>
      <div style="display:flex;align-items:center;gap:6px">
        <div style="width:50px;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
          <div style="height:6px;width:${Math.min(eriScore,100)}%;background:${eriCls};border-radius:3px"></div>
        </div>
        <strong style="font-size:12px">${eriScore}</strong>
      </div>
    </td>
    <td>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${Object.entries(byType).map(([t,n]) => `${tokenBadge(t)}${n>1?` <sup>×${n}</sup>`:""}`).join("") || '<span style="color:var(--muted);font-size:12px">none</span>'}
      </div>
    </td>
    <td>
      <span class="ep-status ${worker.iban_verified ? "verified" : "pending"}">${worker.iban_verified ? "VERIFIED" : "MISSING"}</span>
    </td>
    <td><strong style="font-size:12px">${edges.length}</strong></td>
    <td>
      <span class="check-status ${HEALTH_CLS[health] || "pending"}">${health}</span>
    </td>`
  return tr
}

function tokenExplorerRow(tok) {
  const d = document.createElement("div")
  d.className = "ep-item"
  d.style.cssText = "flex-direction:column;align-items:flex-start;gap:6px;padding:12px 16px"

  const top = document.createElement("div")
  top.style.cssText = "display:flex;align-items:center;gap:10px;width:100%"
  top.innerHTML = `
    <span style="font-size:18px">${TOKEN_ICON[tok.token_type] || "🪙"}</span>
    <div style="flex:1">
      <div style="font-weight:700;font-size:13px">${tok.token_type.replace(/_/g," ")}</div>
      <div style="font-size:11px;color:var(--muted);font-family:monospace">${tok.id}</div>
    </div>
    <span class="ep-status ${tok.status === "ISSUED" ? "verified" : tok.status === "REVOKED" ? "fail" : "pending"}">${tok.status}</span>`
  d.appendChild(top)

  const detail = document.createElement("div")
  detail.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%;padding-left:28px"
  detail.innerHTML = `
    <div style="font-size:12px"><span style="color:var(--muted)">Owner</span><br><strong>${tok.owner_worker_id}</strong></div>
    <div style="font-size:12px"><span style="color:var(--muted)">Source</span><br><strong>${tok.source_type}:${tok.source_id.slice(0,12)}…</strong></div>
    <div style="font-size:12px"><span style="color:var(--muted)">Issued</span><br><strong>${new Date(tok.issued_at).toLocaleDateString()}</strong></div>`
  d.appendChild(detail)

  return d
}

function graphEdgeRow(edge) {
  const d = document.createElement("div")
  d.className = "ep-item"
  d.style.padding = "10px 16px"
  const icon = REL_ICON[edge.relation_type] || "↔"
  d.innerHTML = `
    <span style="font-size:16px;min-width:24px">${icon}</span>
    <div style="flex:1">
      <span style="font-weight:600;font-size:12px">${edge.relation_type.replace(/_/g," ")}</span>
      <span style="font-size:12px;color:var(--muted);margin-left:8px">${edge.from_worker_id}${edge.to_worker_id ? " → " + edge.to_worker_id : " → [project]"}</span>
    </div>
    <span style="font-size:11px;color:var(--muted)">${edge.source_type}</span>`
  return d
}

async function issueTokens() {
  const token  = localStorage.getItem("pw_token") || ""
  const tenant = localStorage.getItem("pw_tenant") || "default"
  const res = await fetch("/api/identity/tokens/issue", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "x-tenant-id": tenant },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error((await res.json()).error || "Failed")
  return res.json()
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">Work Identity</div>
      <div class="page-sub">Tenant: ${getTenant()} — Trust signals → Identity tokens · Relationship graph · Portable credentials</div>`

    // KPI strip
    const strip = document.createElement("div")
    strip.className = "kpi-strip"
    strip.style.gridTemplateColumns = "repeat(5,1fr)"
    strip.innerHTML = '<div class="page-load" style="grid-column:1/-1">Loading identity summary…</div>'
    container.appendChild(strip)

    // Issue button
    const issueBtn = document.createElement("button")
    issueBtn.className = "btn btn-gold"
    issueBtn.style.marginBottom = "18px"
    issueBtn.textContent = "⚡ Derive Identity Tokens from Trusted Records"
    issueBtn.addEventListener("click", async () => {
      issueBtn.disabled = true; issueBtn.textContent = "Deriving…"
      try {
        const r = await issueTokens()
        const d = r.data || r
        toast.ok(`Issued ${d.tokens_issued} tokens, ${d.graph_edges_added} graph edges`)
        loadAll()
      } catch(e) { toast.err(e.message) }
      finally { issueBtn.disabled = false; issueBtn.textContent = "⚡ Derive Identity Tokens from Trusted Records" }
    })
    container.appendChild(issueBtn)

    // Tab-style 4-panel layout
    const tabRow = document.createElement("div")
    tabRow.style.cssText = "display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap"
    const tabs    = ["Worker Table", "Token Explorer", "Graph / Relations", "API Readiness"]
    const panels  = []
    let activeTab = 0

    tabs.forEach((label, i) => {
      const btn = document.createElement("button")
      btn.className = "btn " + (i === 0 ? "btn-primary" : "btn-secondary")
      btn.textContent = label
      btn.style.cssText = "padding:6px 14px;font-size:12px"
      btn.addEventListener("click", () => {
        activeTab = i
        tabRow.querySelectorAll("button").forEach((b,j) => {
          b.className = "btn " + (j === i ? "btn-primary" : "btn-secondary")
        })
        panels.forEach((p, j) => { p.style.display = j === i ? "" : "none" })
      })
      tabRow.appendChild(btn)
    })
    container.appendChild(tabRow)

    // Panel 0: Worker Identity Table
    const p0 = document.createElement("div")
    const tableWrap = document.createElement("div")
    tableWrap.className = "table-wrap"
    const table = document.createElement("table")
    table.innerHTML = `<thead><tr>
      <th>Worker</th><th>Type</th><th>ERI Score</th><th>Identity Tokens</th><th>IBAN</th><th>Graph Links</th><th>Health</th>
    </tr></thead>`
    const tbody = document.createElement("tbody")
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center"><div class="page-load">Loading…</div></td></tr>'
    table.appendChild(tbody)
    tableWrap.appendChild(table)
    p0.appendChild(tableWrap)
    panels.push(p0)
    container.appendChild(p0)

    // Panel 1: Token Explorer
    const p1 = document.createElement("div")
    p1.style.display = "none"
    const tokenFilter = document.createElement("div")
    tokenFilter.className = "filters"
    tokenFilter.style.marginBottom = "12px"
    tokenFilter.innerHTML = `<label>Token Type <select id="tok-type-filter">
      <option value="">All</option>
      <option value="PROJECT_COMPLETION_TOKEN">Project Completion</option>
      <option value="COMPLIANCE_VERIFICATION_TOKEN">Compliance Verification</option>
      <option value="PHR_APPROVAL_TOKEN">PHR Approval</option>
      <option value="TEAM_LEADERSHIP_TOKEN">Team Leadership</option>
    </select></label>`
    const tokenList = document.createElement("div")
    tokenList.innerHTML = '<div class="page-load">Loading tokens…</div>'
    p1.appendChild(tokenFilter)
    p1.appendChild(tokenList)
    panels.push(p1)
    container.appendChild(p1)

    // Panel 2: Graph / Relations
    const p2 = document.createElement("div")
    p2.style.display = "none"
    const graphFilter = document.createElement("div")
    graphFilter.className = "filters"
    graphFilter.style.marginBottom = "12px"
    graphFilter.innerHTML = `<label>Relation Type <select id="rel-type-filter">
      <option value="">All</option>
      <option value="WORKED_WITH">Worked With</option>
      <option value="COMPLETED_PROJECT">Completed Project</option>
      <option value="PASSED_COMPLIANCE">Passed Compliance</option>
      <option value="LED_TEAM">Led Team</option>
    </select></label>`
    const graphList = document.createElement("div")
    graphList.innerHTML = '<div class="page-load">Loading graph…</div>'
    p2.appendChild(graphFilter)
    p2.appendChild(graphList)
    panels.push(p2)
    container.appendChild(p2)

    // Panel 3: API Readiness
    const p3 = document.createElement("div")
    p3.style.display = "none"
    p3.className = "card"
    p3.innerHTML = `
      <div class="card-title">🔌 Identity API — Enterprise Readiness</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:16px">
        Tenant-safe, role-aware identity API. All responses are audit-safe — no raw documents exposed.
      </div>
      <div class="check-list">
        <div class="check-item"><div class="check-icon">✅</div><div class="check-text">GET /api/identity/summary</div><div class="check-status pass">LIVE</div></div>
        <div class="check-item"><div class="check-icon">✅</div><div class="check-text">GET /api/identity/tokens</div><div class="check-status pass">LIVE</div></div>
        <div class="check-item"><div class="check-icon">✅</div><div class="check-text">GET /api/identity/tokens/:id</div><div class="check-status pass">LIVE</div></div>
        <div class="check-item"><div class="check-icon">✅</div><div class="check-text">POST /api/identity/tokens/issue</div><div class="check-status pass">LIVE</div></div>
        <div class="check-item"><div class="check-icon">✅</div><div class="check-text">GET /api/identity/graph</div><div class="check-status pass">LIVE</div></div>
        <div class="check-item"><div class="check-icon">✅</div><div class="check-text">GET /api/identity/workers/:workerId</div><div class="check-status pass">LIVE</div></div>
        <div class="check-item"><div class="check-icon">⚠️</div><div class="check-text">External federation API</div><div class="check-status warn">PLANNED</div></div>
        <div class="check-item"><div class="check-icon">⚠️</div><div class="check-text">Credential export (W3C VC format)</div><div class="check-status warn">PLANNED</div></div>
      </div>
      <div style="margin-top:16px;padding:12px 16px;background:var(--bg);border-radius:10px;font-size:12px;color:var(--muted)">
        <strong>Role boundary:</strong> All identity endpoints require admin authentication.<br>
        <strong>Tenant safety:</strong> Tokens and graph are fully scoped to the requesting tenant.<br>
        <strong>No sensitive data:</strong> Raw documents, national IDs, and IBANs are not exposed in identity payloads.
      </div>`
    panels.push(p3)
    container.appendChild(p3)

    let allWorkers = [], allEri = {}, allTokens = [], allGraph = []

    function renderWorkerTable() {
      tbody.innerHTML = ""
      if (allWorkers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted)">No workers</td></tr>'
        return
      }
      allWorkers.forEach(w => {
        const tokens = allTokens.filter(t => t.owner_worker_id === w.id)
        const edges  = allGraph.filter(e => e.from_worker_id === w.id || e.to_worker_id === w.id)
        tbody.appendChild(workerIdentityRow(w, allEri[w.id], tokens, edges))
      })
    }

    function renderTokenList() {
      const typeFilter = document.getElementById("tok-type-filter")?.value || ""
      tokenList.innerHTML = ""
      let items = allTokens
      if (typeFilter) items = items.filter(t => t.token_type === typeFilter)
      if (items.length === 0) {
        tokenList.innerHTML = '<div style="font-size:13px;color:var(--muted)">No tokens — click "Derive Identity Tokens" above</div>'
        return
      }
      items.forEach(t => tokenList.appendChild(tokenExplorerRow(t)))
    }

    function renderGraph() {
      const relFilter = document.getElementById("rel-type-filter")?.value || ""
      graphList.innerHTML = ""
      let items = allGraph
      if (relFilter) items = items.filter(e => e.relation_type === relFilter)
      if (items.length === 0) {
        graphList.innerHTML = '<div style="font-size:13px;color:var(--muted)">No graph edges — click "Derive Identity Tokens" above</div>'
        return
      }
      items.forEach(e => graphList.appendChild(graphEdgeRow(e)))
    }

    document.getElementById("tok-type-filter")?.addEventListener("change", renderTokenList)
    document.getElementById("rel-type-filter")?.addEventListener("change", renderGraph)

    function loadAll() {
      Promise.all([
        apiGet("/api/admin/workers"),
        apiGet("/api/admin/eri"),
        apiGet("/api/identity/tokens"),
        apiGet("/api/identity/graph"),
        apiGet("/api/identity/summary"),
      ]).then(([workersData, eriData, tokensData, graphData, summaryData]) => {
        allWorkers = workersData.workers || workersData.items || []
        allEri     = {}
        ;(eriData.items || []).forEach(e => { allEri[e.worker_id] = e })
        allTokens  = tokensData.items || []
        allGraph   = graphData.items  || []

        const s = summaryData || {}
        strip.innerHTML = ""
        strip.appendChild(kpi("Total Tokens",    s.total_tokens       ?? "—", "issued",          "gold"))
        strip.appendChild(kpi("Graph Edges",     s.total_graph_edges  ?? "—", "relationships",   ""))
        strip.appendChild(kpi("Token Workers",   s.token_workers      ?? "—", "with credentials","green"))
        strip.appendChild(kpi("Project Tokens",  s.tokens_by_type?.PROJECT_COMPLETION_TOKEN      ?? 0, "completions", ""))
        strip.appendChild(kpi("Compliance Tkns", s.tokens_by_type?.COMPLIANCE_VERIFICATION_TOKEN ?? 0, "verifications",""))

        renderWorkerTable()
        renderTokenList()
        renderGraph()
      }).catch(e => {
        strip.innerHTML = `<div class="page-err" style="grid-column:1/-1">${e.message}</div>`
        toast.err(e.message)
      })
    }

    loadAll()
  }
}
