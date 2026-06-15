import { apiGet } from "../api.js"
import { renderTable } from "../components/table.js"
import { toast } from "../components/toast.js"

// Mirrors admin_permissions.js — static source of truth for role → permission sets
const ROLE_PERMS = {
  superadmin: ["*  (all permissions)"],
  ops: [
    "admin:stats:read",
    "admin:governance:read",
    "admin:workers:read",
    "admin:workers:write",
    "admin:pods:read",
    "admin:pods:write",
    "admin:principals:read",
    "admin:principals:write",
    "admin:wos:assignments:write",
  ],
  auditor: [
    "admin:stats:read",
    "admin:governance:read",
    "admin:workers:read",
    "admin:pods:read",
    "admin:principals:read",
  ],
}

function section(label) {
  const el = document.createElement("div")
  el.style.cssText = "font-size:12px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.04em;margin:18px 0 8px"
  el.textContent = label
  return el
}

function kvTable(pairs) {
  const wrap = document.createElement("div")
  wrap.className = "kv-table"
  const table = document.createElement("table")
  const tbody = document.createElement("tbody")
  pairs.forEach(([k, v]) => {
    const tr = document.createElement("tr")
    const tdK = document.createElement("td"); tdK.textContent = k
    const tdV = document.createElement("td"); tdV.textContent = v === null || v === undefined ? "—" : String(v)
    tr.appendChild(tdK); tr.appendChild(tdV)
    tbody.appendChild(tr)
  })
  table.appendChild(tbody)
  wrap.appendChild(table)
  return wrap
}

function statusBadge(s) {
  const color = s === "pass" ? "#1a7f37" : s === "fail" ? "#b00020" : "#666"
  return `<span style="color:${color};font-weight:600">${s || "—"}</span>`
}

export default {
  render(container) {
    const title = document.createElement("div")
    title.className = "page-title"
    title.textContent = "Governance"
    container.appendChild(title)

    const loading = document.createElement("div")
    loading.className = "page-load"
    loading.textContent = "Loading..."
    container.appendChild(loading)

    Promise.all([
      apiGet("/api/admin/governance"),
      apiGet("/api/admin/principals").catch(() => null),  // best-effort
    ])
      .then(([gov, prn]) => {
        loading.remove()

        // ── Checks table ──────────────────────────────────────
        const checks = Array.isArray(gov.checks) ? gov.checks : []
        container.appendChild(section("System Checks"))
        container.appendChild(renderTable(
          [
            { key: "name",    label: "Check",   mono: true },
            { key: "status",  label: "Status",  render: v => statusBadge(v) },
            { key: "message", label: "Message" },
          ],
          checks,
          "No checks recorded"
        ))

        // ── Last doctor run ───────────────────────────────────
        const dr = gov.last_doctor_run || {}
        container.appendChild(section("Last Doctor Run"))
        container.appendChild(kvTable([
          ["status",    dr.status],
          ["passed",    dr.passed],
          ["total",     dr.total],
          ["timestamp", dr.timestamp],
        ]))

        // ── CI status ─────────────────────────────────────────
        const ci = gov.ci_status || {}
        container.appendChild(section("CI Status"))
        container.appendChild(kvTable([
          ["status",   ci.status],
          ["branch",   ci.branch],
          ["last_run", ci.last_run],
          ["note",     ci.note],
        ]))

        // ── Notes ─────────────────────────────────────────────
        const notes = Array.isArray(gov.notes) ? gov.notes : []
        if (notes.length > 0) {
          container.appendChild(section("Notes"))
          const ul = document.createElement("ul")
          ul.style.cssText = "font-size:13px;padding-inline-start:18px;display:flex;flex-direction:column;gap:4px"
          notes.forEach(n => {
            const li = document.createElement("li"); li.textContent = n; ul.appendChild(li)
          })
          container.appendChild(ul)
        }

        // ── Roles & permissions ───────────────────────────────
        container.appendChild(section("Roles & Permissions"))

        // Derive row list: merge code-side ROLE_PERMS with any DB-side roles
        const dbRoles = (prn && prn.roles && typeof prn.roles === "object") ? prn.roles : {}
        const allRoles = new Set([...Object.keys(ROLE_PERMS), ...Object.keys(dbRoles)])
        const roleRows = Array.from(allRoles).map(role => ({
          role,
          permissions: (ROLE_PERMS[role] || ["(no static mapping)"]).join(", "),
          source: ROLE_PERMS[role] ? "code" : "db",
        }))

        container.appendChild(renderTable(
          [
            { key: "role",        label: "Role",        mono: true },
            { key: "permissions", label: "Permissions", mono: true },
            { key: "source",      label: "Source" },
          ],
          roleRows,
          "No roles defined"
        ))

        // ── Raw JSON fallback ─────────────────────────────────
        container.appendChild(section("Raw Response"))
        const pre = document.createElement("pre")
        pre.style.cssText = "font-size:12px;white-space:pre-wrap;border:1px solid #eee;border-radius:12px;padding:12px"
        pre.textContent = JSON.stringify({ governance: gov, principals: prn }, null, 2)
        container.appendChild(pre)
      })
      .catch(e => {
        loading.remove()
        const msg = String(e && e.message ? e.message : e)
        const err = document.createElement("div")
        err.className = "page-err"
        err.textContent = msg
        container.appendChild(err)
        toast.err(msg)
      })
  }
}
