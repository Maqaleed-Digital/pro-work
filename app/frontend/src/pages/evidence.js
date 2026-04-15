import { apiGet, apiPost, getTenant } from "../api.js"
import { toast } from "../components/toast.js"

function epItem(pack) {
  const d = document.createElement("div")
  d.className = "ep-item"
  d.innerHTML = `
    <div class="ep-id">${pack.id}</div>
    <div class="ep-meta">${pack.action || pack.type}${pack.worker_id ? " · Worker: " + pack.worker_id : ""}</div>
    <div class="ep-ts">${pack.ts ? new Date(pack.ts).toLocaleString() : ""}</div>
    <div class="ep-status ${pack.status === "verified" ? "verified" : "pending"}">${pack.status || "pending"}</div>`
  return d
}

function generateBtn(label, type, onReload) {
  const b = document.createElement("button")
  b.className = "btn btn-gold"
  b.textContent = label
  b.addEventListener("click", async () => {
    b.disabled = true
    b.textContent = "Generating…"
    try {
      const pack = await apiPost("/api/admin/evidence-packs", {
        type,
        action: type.toLowerCase() + ".generated",
      })
      toast.ok("Evidence pack generated: " + pack.id)
      onReload()
    } catch (e) {
      toast.err(e.message)
    } finally {
      b.disabled = false
      b.textContent = label
    }
  })
  return b
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">Trust &amp; Evidence</div>
      <div class="page-sub">Tenant: ${getTenant()} — Immutable evidence packs, audit-ready at any time</div>`

    const grid = document.createElement("div")
    grid.className = "cc-grid-2"
    container.appendChild(grid)

    // ── Generate packs card ───────────────────────────────────────────────────
    const genCard = document.createElement("div")
    genCard.className = "card"
    genCard.innerHTML = `<div class="card-title">📦 Generate Evidence Pack</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:14px">
        Generate BRD-aligned evidence packs for compliance and audit requirements.
      </div>`

    const btnWrap = document.createElement("div")
    btnWrap.style.cssText = "display:flex;flex-direction:column;gap:8px"
    genCard.appendChild(btnWrap)
    grid.appendChild(genCard)

    // ── Pack list card ────────────────────────────────────────────────────────
    const listCard = document.createElement("div")
    listCard.className = "card"
    listCard.innerHTML = `<div class="card-title">🧾 Evidence Pack Library</div>`
    const listEl = document.createElement("div")
    listEl.className = "ep-list"
    listEl.innerHTML = '<div class="page-load">Loading…</div>'
    listCard.appendChild(listEl)
    grid.appendChild(listCard)

    function loadPacks() {
      apiGet("/api/admin/evidence-packs")
        .then(data => {
          listEl.innerHTML = ""
          const packs = data.items || []
          if (packs.length === 0) {
            const empty = document.createElement("div")
            empty.style.cssText = "font-size:13px;color:var(--muted);padding:12px 0"
            empty.textContent = "No evidence packs yet — generate one above"
            listEl.appendChild(empty)
          } else {
            packs.slice().reverse().forEach(p => listEl.appendChild(epItem(p)))
          }
        })
        .catch(e => {
          listEl.innerHTML = `<div class="page-err">${e.message}</div>`
        })
    }

    // Export ZIP button
    const exportBtn = document.createElement("button")
    exportBtn.className = "btn btn-primary"
    exportBtn.style.cssText = "margin-bottom:14px;align-self:flex-start"
    exportBtn.textContent = "⬇ Export All (ZIP)"
    exportBtn.addEventListener("click", async () => {
      exportBtn.disabled = true
      exportBtn.textContent = "Preparing…"
      try {
        const token  = localStorage.getItem("pw_token") || ""
        const tenant = localStorage.getItem("pw_tenant") || "default"
        const resp   = await fetch("/api/admin/export/evidence-packs", {
          headers: { Authorization: "Bearer " + token, "x-tenant-id": tenant }
        })
        if (!resp.ok) throw new Error("Export failed: " + resp.status)
        const blob = await resp.blob()
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement("a")
        a.href     = url
        a.download = `evidence-export-${tenant}-${Date.now()}.zip`
        a.click()
        URL.revokeObjectURL(url)
        toast.ok("Export downloaded")
      } catch (e) {
        toast.err(e.message)
      } finally {
        exportBtn.disabled = false
        exportBtn.textContent = "⬇ Export All (ZIP)"
      }
    })
    genCard.appendChild(exportBtn)

    const PACK_TYPES = [
      ["EP-WOS-RECRUIT-01 · Candidate Evaluation",  "EP-WOS-RECRUIT"],
      ["EP-WOS-HIRE-01 · Offer & Contract Signed",   "EP-WOS-HIRE"],
      ["EP-WOS-ONBOARD-01 · WPS Readiness Pack",     "EP-WOS-ONBOARD"],
      ["EP-WOS-PROB-01 · Probation Evidence",        "EP-WOS-PROB"],
      ["EP-WOS-OFFBOARD-01 · Offboarding Pack",      "EP-WOS-OFFBOARD"],
    ]
    PACK_TYPES.forEach(([label, type]) => {
      btnWrap.appendChild(generateBtn(label, type, loadPacks))
    })

    loadPacks()

    // ── Schema card ───────────────────────────────────────────────────────────
    const schemaCard = document.createElement("div")
    schemaCard.className = "card"
    schemaCard.style.marginTop = "16px"
    schemaCard.innerHTML = `
      <div class="card-title">📋 Evidence Pack Schema — Required Fields</div>
      <div class="check-list">
        <div class="check-item"><div class="check-icon">👤</div><div class="check-text">Actor (HR / AI / System)</div><div class="check-status pass">ACTIVE</div></div>
        <div class="check-item"><div class="check-icon">⚡</div><div class="check-text">Action (what was done)</div><div class="check-status pass">ACTIVE</div></div>
        <div class="check-item"><div class="check-icon">🕐</div><div class="check-text">Timestamp (immutable, UTC)</div><div class="check-status pass">ACTIVE</div></div>
        <div class="check-item"><div class="check-icon">📸</div><div class="check-text">Data snapshot (state before/after)</div><div class="check-status warn">PARTIAL</div></div>
        <div class="check-item"><div class="check-icon">📎</div><div class="check-text">Attached files (contracts, IDs)</div><div class="check-status warn">PENDING</div></div>
        <div class="check-item"><div class="check-icon">✅</div><div class="check-text">Approval chain (who approved what)</div><div class="check-status pass">ACTIVE</div></div>
        <div class="check-item"><div class="check-icon">🤖</div><div class="check-text">AI artifacts (model, prompt, output)</div><div class="check-status pass">ACTIVE</div></div>
        <div class="check-item"><div class="check-icon">🔒</div><div class="check-text">Redaction rules (PDPL-compliant)</div><div class="check-status warn">PENDING</div></div>
        <div class="check-item"><div class="check-icon">📦</div><div class="check-text">Export format (ZIP + PDF bundle)</div><div class="check-status warn">PENDING</div></div>
      </div>`
    container.appendChild(schemaCard)
  }
}
