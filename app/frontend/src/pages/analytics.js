import { apiGet, apiPost } from "../api.js"
import { toast } from "../components/toast.js"

// ── small helpers ─────────────────────────────────────────────────────────────

function pct(rate) {
  if (rate == null || !Number.isFinite(rate)) return "—"
  return (rate * 100).toFixed(1) + "%"
}

function fmt(n) {
  return n == null ? "—" : String(n)
}

function fmtDate(iso) {
  if (!iso) return "—"
  return String(iso).slice(0, 19).replace("T", " ")
}

function metricCard(label, value, sub = "") {
  const card = document.createElement("div")
  card.style.cssText =
    "border:1px solid #eee;border-radius:12px;padding:14px 18px;min-width:150px;flex:1"

  const lbl = document.createElement("div")
  lbl.style.cssText =
    "font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px"
  lbl.textContent = label

  const val = document.createElement("div")
  val.style.cssText = "font-size:24px;font-weight:700;color:#111;line-height:1.2"
  val.textContent = value

  card.appendChild(lbl)
  card.appendChild(val)

  if (sub) {
    const s = document.createElement("div")
    s.style.cssText = "font-size:11px;color:#888;margin-top:4px"
    s.textContent = sub
    card.appendChild(s)
  }
  return card
}

function sectionTitle(text) {
  const el = document.createElement("div")
  el.style.cssText =
    "font-weight:600;font-size:13px;margin:20px 0 10px"
  el.textContent = text
  return el
}

// ── tenant metrics table ──────────────────────────────────────────────────────

function buildTenantsTable(tenants) {
  const wrap = document.createElement("div")
  wrap.className = "table-wrap"

  const table = document.createElement("table")

  const thead = document.createElement("thead")
  const hr = document.createElement("tr")
  ;["Tenant", "Workers", "Active", "Assigned", "Utilization", "Pods", "Assignments", "Evidence", "Computed"].forEach(h => {
    const th = document.createElement("th"); th.textContent = h; hr.appendChild(th)
  })
  thead.appendChild(hr)
  table.appendChild(thead)

  const tbody = document.createElement("tbody")
  if (!tenants.length) {
    const tr = document.createElement("tr")
    const td = document.createElement("td")
    td.colSpan = 9; td.textContent = "No tenants"; td.className = "empty-row"
    tr.appendChild(td); tbody.appendChild(tr)
  } else {
    tenants.forEach(m => {
      const tr = document.createElement("tr")
      const cells = [
        { text: m.tenant_id, mono: true },
        { text: fmt(m.workforce.total_workers) },
        { text: fmt(m.workforce.active_workers) },
        { text: fmt(m.workforce.assigned_count) },
        { text: pct(m.workforce.utilization_rate) },
        { text: fmt(m.pods.total_pods) },
        { text: fmt(m.assignments.active_assignments) },
        { text: fmt(m.evidence.total_events) },
        { text: fmtDate(m.computed_at) }
      ]
      cells.forEach(({ text, mono }) => {
        const td = document.createElement("td")
        if (mono) td.className = "mono"
        td.textContent = text
        tr.appendChild(td)
      })
      tbody.appendChild(tr)
    })
  }
  table.appendChild(tbody)
  wrap.appendChild(table)
  return wrap
}

// ── snapshots list ────────────────────────────────────────────────────────────

function buildSnapshotsTable(snapshots) {
  const wrap = document.createElement("div")
  wrap.className = "table-wrap"

  const table = document.createElement("table")

  const thead = document.createElement("thead")
  const hr = document.createElement("tr")
  ;["Snapshotted At", "Tenants", "Workers", "Utilization", "Active Assignments", "Evidence Events"].forEach(h => {
    const th = document.createElement("th"); th.textContent = h; hr.appendChild(th)
  })
  thead.appendChild(hr)
  table.appendChild(thead)

  const tbody = document.createElement("tbody")
  if (!snapshots.length) {
    const tr = document.createElement("tr")
    const td = document.createElement("td")
    td.colSpan = 6; td.textContent = "No snapshots yet"; td.className = "empty-row"
    tr.appendChild(td); tbody.appendChild(tr)
  } else {
    // show newest first
    const sorted = [...snapshots].reverse()
    sorted.forEach(s => {
      const agg = s.aggregate || {}
      const tr = document.createElement("tr")
      const cells = [
        fmtDate(s.snapshotted_at),
        fmt(agg.tenant_count),
        fmt(agg.total_workers),
        pct(agg.utilization_rate),
        fmt(agg.active_assignments),
        fmt(agg.total_evidence_events)
      ]
      cells.forEach((text, i) => {
        const td = document.createElement("td")
        if (i === 0) td.className = "mono"
        td.textContent = text
        tr.appendChild(td)
      })
      tbody.appendChild(tr)
    })
  }
  table.appendChild(tbody)
  wrap.appendChild(table)
  return wrap
}

// ── page ──────────────────────────────────────────────────────────────────────

export default {
  render(container) {
    const title = document.createElement("div")
    title.className = "page-title"
    title.textContent = "Analytics"
    container.appendChild(title)

    // toolbar
    const toolbar = document.createElement("div")
    toolbar.className = "actions-row"
    toolbar.style.marginBottom = "16px"

    const refreshBtn = document.createElement("button")
    refreshBtn.className = "btn"
    refreshBtn.textContent = "Refresh"

    const snapshotBtn = document.createElement("button")
    snapshotBtn.className = "btn btn-primary"
    snapshotBtn.textContent = "Take Snapshot"

    toolbar.appendChild(refreshBtn)
    toolbar.appendChild(snapshotBtn)
    container.appendChild(toolbar)

    // summary cards area
    const cardsSlot = document.createElement("div")
    container.appendChild(cardsSlot)

    // tenant table area
    const tenantsSlot = document.createElement("div")
    container.appendChild(tenantsSlot)

    // snapshots area
    const snapshotsSlot = document.createElement("div")
    container.appendChild(snapshotsSlot)

    // ── render helpers ──────────────────────────────────────────────────────

    function renderCards(agg) {
      cardsSlot.innerHTML = ""
      if (!agg) return

      cardsSlot.appendChild(sectionTitle("Summary"))
      const row = document.createElement("div")
      row.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px"

      row.appendChild(metricCard(
        "Utilization",
        pct(agg.utilization_rate),
        `${fmt(agg.assigned_workers)} / ${fmt(agg.active_workers)} active workers assigned`
      ))
      row.appendChild(metricCard(
        "Assignment Density",
        Number.isFinite(agg.assignment_density) ? agg.assignment_density.toFixed(2) : "—",
        `${fmt(agg.active_assignments)} assignments across ${fmt(agg.active_pods)} active pods`
      ))
      row.appendChild(metricCard(
        "Total Workers",
        fmt(agg.total_workers),
        `across ${fmt(agg.tenant_count)} tenant(s)`
      ))
      row.appendChild(metricCard(
        "Evidence Events",
        fmt(agg.total_evidence_events),
        "all tenants combined"
      ))

      cardsSlot.appendChild(row)
    }

    function renderTenants(tenants) {
      tenantsSlot.innerHTML = ""
      tenantsSlot.appendChild(sectionTitle("Per-Tenant Breakdown"))
      tenantsSlot.appendChild(buildTenantsTable(tenants || []))
    }

    function renderSnapshots(snapshots) {
      snapshotsSlot.innerHTML = ""
      snapshotsSlot.appendChild(sectionTitle("Snapshot History"))
      snapshotsSlot.appendChild(buildSnapshotsTable(snapshots || []))
    }

    // ── data loading ────────────────────────────────────────────────────────

    function loadAnalytics() {
      cardsSlot.innerHTML = '<div class="page-load">Loading…</div>'
      tenantsSlot.innerHTML = ""
      return apiGet("/api/admin/analytics")
        .then(data => {
          renderCards(data.aggregate)
          renderTenants(data.tenants)
        })
        .catch(e => {
          const msg = String(e && e.message ? e.message : e)
          cardsSlot.innerHTML = `<div class="page-err">${msg}</div>`
          toast.err(msg)
        })
    }

    function loadSnapshots() {
      return apiGet("/api/admin/analytics/snapshots")
        .then(data => renderSnapshots(data.snapshots))
        .catch(() => renderSnapshots([]))
    }

    function loadAll() {
      return Promise.all([loadAnalytics(), loadSnapshots()])
    }

    refreshBtn.addEventListener("click", loadAll)

    snapshotBtn.addEventListener("click", () => {
      snapshotBtn.disabled = true
      apiPost("/api/admin/analytics/snapshot")
        .then(data => {
          toast.ok(`Snapshot saved (${data.tenant_count} tenant(s))`)
          loadSnapshots()
        })
        .catch(e => toast.err(String(e && e.message ? e.message : e)))
        .finally(() => { snapshotBtn.disabled = false })
    })

    loadAll()
  }
}
