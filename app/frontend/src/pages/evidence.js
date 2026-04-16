/**
 * S38-G3 — Trust & Evidence Control Screen (/evidence)
 *
 * Section A — Evidence Pack Library (table + filters)
 * Section B — Pack Detail Viewer (integrity badge, redaction indicator, approval chain)
 * Section C — Export Controls (JSON / ZIP per pack; bulk ZIP)
 * Section D — Audit Trail
 *
 * Arabic RTL layout — all labels bilingual (EN / AR).
 * Role selector drives server-side redaction via X-Requesting-Role header.
 */

import { apiGet, apiPost, getTenant } from "../api.js"
import { renderTable } from "../components/table.js"
import { toast } from "../components/toast.js"

// ── helpers ───────────────────────────────────────────────────────────────────

function apiEvidenceGet(path, role) {
  return fetch(path, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("pw_token") || ""}`,
      "X-Tenant-Id": getTenant(),
      "X-Requesting-Role": role || "VIEWER",
      "cache-control": "no-store",
    },
  }).then(r => r.json())
}

function apiEvidencePost(path, body, role) {
  return fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("pw_token") || ""}`,
      "X-Tenant-Id": getTenant(),
      "X-Requesting-Role": role || "VIEWER",
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  })
}

function el(tag, props = {}, text) {
  const e = document.createElement(tag)
  Object.entries(props).forEach(([k, v]) => {
    if (k === "style") Object.assign(e.style, v)
    else if (k === "class") e.className = v
    else e[k] = v
  })
  if (text !== undefined) e.textContent = text
  return e
}

function badge(text, color) {
  const b = el("span", { class: "mono" })
  b.textContent = text
  b.style.cssText = `display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;
    background:${color};color:#fff;font-weight:600;letter-spacing:.5px`
  return b
}

function statusBadge(status) {
  const map = { OPEN: "#d97706", CLOSED: "#16a34a", EXPORTED: "#2563eb" }
  return badge(status, map[status] || "#6b7280")
}

function integrityBadge(ok) {
  return ok
    ? badge("Hash verified ✓", "#16a34a")
    : badge("INTEGRITY ERROR ✗", "#dc2626")
}

function fmt(iso) {
  if (!iso) return "—"
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

function section(title, arTitle) {
  const wrap = el("div", { style: { marginTop: "24px" } })
  const h = el("h3", { style: { margin: "0 0 12px", fontSize: "15px", color: "#1e293b" } })
  h.textContent = `${title} — ${arTitle}`
  wrap.appendChild(h)
  return wrap
}

// ── main page ─────────────────────────────────────────────────────────────────

export default {
  render(container) {

    // ── page title ──────────────────────────────────────────────────────────
    const titleRow = el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" } })
    const title = el("div", { class: "page-title" }, "Trust & Evidence — الأدلة والثقة")
    titleRow.appendChild(title)

    // Role selector (drives server-side redaction)
    const roleWrap = el("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" } })
    roleWrap.appendChild(el("label", {}, "Role / الدور:"))
    const roleSel = el("select", { style: { fontSize: "13px", padding: "4px 8px", borderRadius: "4px", border: "1px solid #cbd5e1", cursor: "pointer" } })
    ;["VIEWER", "HR", "FINANCE", "MANAGER", "AI", "SYSTEM"].forEach(r => {
      const o = el("option", { value: r }, r)
      if (r === "HR") o.selected = true
      roleSel.appendChild(o)
    })
    roleWrap.appendChild(roleSel)
    titleRow.appendChild(roleWrap)
    container.appendChild(titleRow)

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION A — Evidence Pack Library
    // ─────────────────────────────────────────────────────────────────────────
    const secA = section("Evidence Pack Library", "مكتبة حزم الأدلة")
    container.appendChild(secA)

    // Filters
    const filters = el("div", { class: "filters" })

    const typeInput = el("input", { placeholder: "Pack type / النوع" })
    const statusInput = el("input", { placeholder: "Status / الحالة (OPEN/CLOSED/EXPORTED)" })
    const subjectInput = el("input", { placeholder: "Subject / الموضوع" })

    const applyBtn = el("button", { class: "btn btn-primary" }, "Apply / تطبيق")
    const resetBtn = el("button", { class: "btn" }, "Reset / إعادة")

    ;[["Type / النوع", typeInput], ["Status / الحالة", statusInput], ["Subject / الموضوع", subjectInput]].forEach(([lbl, inp]) => {
      const l = el("label")
      l.textContent = lbl + " "
      l.appendChild(inp)
      filters.appendChild(l)
    })
    filters.appendChild(applyBtn)
    filters.appendChild(resetBtn)
    secA.appendChild(filters)

    // Bulk select + export toolbar
    const bulkBar = el("div", { style: { display: "flex", gap: "8px", marginBottom: "8px", alignItems: "center" } })
    const selectedIds = new Set()
    const selCountLbl = el("span", { style: { fontSize: "13px", color: "#64748b" } }, "0 selected / محدد")
    const bulkExportBtn = el("button", { class: "btn", disabled: true }, "Bulk ZIP / تصدير مجمع")
    bulkBar.appendChild(selCountLbl)
    bulkBar.appendChild(bulkExportBtn)
    secA.appendChild(bulkBar)

    function updateBulkBar() {
      selCountLbl.textContent = `${selectedIds.size} selected / محدد`
      bulkExportBtn.disabled = selectedIds.size === 0
    }

    const tableSlot = el("div")
    secA.appendChild(tableSlot)

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION B — Pack Detail Viewer
    // ─────────────────────────────────────────────────────────────────────────
    const secB = section("Pack Detail Viewer", "عارض تفاصيل الحزمة")
    container.appendChild(secB)
    const detailSlot = el("div", { style: { minHeight: "48px" } })
    secB.appendChild(detailSlot)

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION C — Export Controls
    // ─────────────────────────────────────────────────────────────────────────
    const secC = section("Export Controls", "ضوابط التصدير")
    container.appendChild(secC)
    const exportSlot = el("div", { style: { minHeight: "36px" } })
    secC.appendChild(exportSlot)

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION D — Audit Trail
    // ─────────────────────────────────────────────────────────────────────────
    const secD = section("Audit Trail", "سجل المراجعة")
    container.appendChild(secD)
    const auditSlot = el("div")
    secD.appendChild(auditSlot)

    // ─────────────────────────────────────────────────────────────────────────
    // STATE + DATA LOADING
    // ─────────────────────────────────────────────────────────────────────────

    let allPacks  = []
    let loading   = false

    function setLoading(v) {
      loading = v
      applyBtn.disabled = v
      resetBtn.disabled = v
    }

    function filteredPacks() {
      const t  = typeInput.value.trim().toUpperCase()
      const s  = statusInput.value.trim().toUpperCase()
      const sb = subjectInput.value.trim().toLowerCase()
      return allPacks.filter(p => {
        if (t  && !p.pack_type.includes(t))                               return false
        if (s  && p.status !== s)                                          return false
        if (sb && !((p.action || "").toLowerCase().includes(sb)))          return false
        return true
      })
    }

    function renderPackTable() {
      tableSlot.innerHTML = ""

      const packs = filteredPacks()
      if (packs.length === 0) {
        tableSlot.innerHTML = '<div class="page-load" style="color:#64748b;padding:24px 0">No evidence packs found / لا توجد حزم أدلة</div>'
        return
      }

      const wrap = el("div", { class: "table-wrap" })
      const tbl = document.createElement("table")

      const thead = el("thead")
      const htr = el("tr")
      ;["☐", "Pack ID", "Type / النوع", "Status / الحالة", "Actor / المنفذ", "Action / الإجراء", "Created / أنشئ", "Closed / أُغلق", "Exported / صُدِّر", "Actions / إجراءات"].forEach(h => {
        const th = document.createElement("th")
        th.textContent = h
        htr.appendChild(th)
      })
      thead.appendChild(htr)
      tbl.appendChild(thead)

      const tbody = el("tbody")
      packs.forEach(pack => {
        const tr = el("tr", { style: { cursor: "pointer" } })

        // Checkbox
        const cbTd = el("td")
        const cb = el("input", { type: "checkbox" })
        cb.checked = selectedIds.has(pack.pack_id)
        cb.addEventListener("change", e => {
          e.stopPropagation()
          if (cb.checked) selectedIds.add(pack.pack_id)
          else selectedIds.delete(pack.pack_id)
          updateBulkBar()
        })
        cbTd.appendChild(cb)
        tr.appendChild(cbTd)

        const mkTd = (text, mono = false) => {
          const td = el("td")
          if (mono) td.className = "mono"
          td.textContent = text || "—"
          return td
        }

        tr.appendChild(mkTd(pack.pack_id, true))

        const typeTd = el("td")
        typeTd.className = "mono"
        typeTd.textContent = pack.pack_type || "—"
        tr.appendChild(typeTd)

        const statusTd = el("td")
        statusTd.appendChild(statusBadge(pack.status))
        tr.appendChild(statusTd)

        tr.appendChild(mkTd(pack.actor_id || "—"))
        tr.appendChild(mkTd(pack.action))
        tr.appendChild(mkTd(fmt(pack.created_at)))
        tr.appendChild(mkTd(fmt(pack.closed_at)))
        tr.appendChild(mkTd(fmt(pack.exported_at)))

        // Action buttons
        const actTd = el("td")
        actTd.style.cssText = "white-space:nowrap"

        const viewBtn = el("button", { class: "btn", style: { fontSize: "12px", padding: "2px 8px", marginRight: "4px" } }, "View / عرض")
        viewBtn.addEventListener("click", e => { e.stopPropagation(); loadDetail(pack.pack_id) })
        actTd.appendChild(viewBtn)

        if (pack.status === "CLOSED" || pack.status === "EXPORTED") {
          const expJSONBtn = el("button", { class: "btn", style: { fontSize: "12px", padding: "2px 8px", marginRight: "4px" } }, "JSON")
          expJSONBtn.addEventListener("click", e => { e.stopPropagation(); exportPack(pack.pack_id, "JSON") })
          actTd.appendChild(expJSONBtn)

          const expZIPBtn = el("button", { class: "btn", style: { fontSize: "12px", padding: "2px 8px" } }, "ZIP")
          expZIPBtn.addEventListener("click", e => { e.stopPropagation(); exportPack(pack.pack_id, "ZIP") })
          actTd.appendChild(expZIPBtn)
        }

        tr.appendChild(actTd)

        tr.addEventListener("click", () => loadDetail(pack.pack_id))
        tbody.appendChild(tr)
      })

      tbl.appendChild(tbody)
      wrap.appendChild(tbl)
      tableSlot.appendChild(wrap)
    }

    function loadPacks() {
      if (loading) return
      setLoading(true)
      tableSlot.innerHTML = '<div class="page-load">Loading… / جاري التحميل</div>'

      apiEvidenceGet("/api/evidence/packs", roleSel.value)
        .then(data => {
          if (!data.ok) throw new Error((data.error || {}).message || "Load failed")
          allPacks = Array.isArray(data.data.packs) ? data.data.packs : []
          selectedIds.clear()
          updateBulkBar()
          renderPackTable()
          loadAuditTrail()
        })
        .catch(e => {
          tableSlot.innerHTML = `<div class="page-err">${e.message}</div>`
          toast.err(e.message)
        })
        .finally(() => setLoading(false))
    }

    // ── Section B: load pack detail ─────────────────────────────────────────

    function loadDetail(packId) {
      detailSlot.innerHTML = '<div class="page-load">Loading… / جاري التحميل</div>'
      exportSlot.innerHTML = ""

      apiEvidenceGet(`/api/evidence/packs/${packId}`, roleSel.value)
        .then(data => {
          detailSlot.innerHTML = ""

          if (!data.ok) {
            const code = (data.error || {}).code
            if (code === "INTEGRITY_VIOLATION") {
              const errBanner = el("div", { style: { background: "#fef2f2", border: "1px solid #fca5a5", padding: "12px 16px", borderRadius: "6px", color: "#dc2626", fontWeight: "600" } })
              errBanner.textContent = "⚠ INTEGRITY ERROR — بيانات الحزمة تالفة: " + ((data.error || {}).message || "")
              detailSlot.appendChild(errBanner)
            } else {
              detailSlot.innerHTML = `<div class="page-err">${(data.error || {}).message}</div>`
            }
            return
          }

          const { pack } = data.data

          // Integrity banner
          const iBanner = el("div", { style: { marginBottom: "12px" } })
          iBanner.appendChild(integrityBadge(true))
          const redactNote = el("span", { style: { marginLeft: "12px", fontSize: "12px", color: "#64748b" } })
          if (pack._requesting_role) {
            redactNote.textContent = `Viewing as ${pack._requesting_role} — العرض بصلاحية`
          }
          iBanner.appendChild(redactNote)
          detailSlot.appendChild(iBanner)

          // Core fields table
          const coreFields = [
            ["pack_id",   pack.pack_id],
            ["pack_type", pack.pack_type],
            ["status",    pack.status],
            ["actor",     JSON.stringify(pack.actor)],
            ["action",    pack.action],
            ["timestamp", fmt(pack.timestamp)],
          ]
          const coreTable = el("table", { style: { marginBottom: "16px", borderCollapse: "collapse", width: "100%" } })
          coreFields.forEach(([k, v]) => {
            const tr = el("tr")
            const kTd = el("td", { class: "mono", style: { fontWeight: "600", paddingRight: "16px", paddingBottom: "4px", whiteSpace: "nowrap", width: "160px" } })
            kTd.textContent = k
            const vTd = el("td", { class: "mono", style: { paddingBottom: "4px", wordBreak: "break-all" } })
            vTd.textContent = String(v === null || v === undefined ? "—" : v)
            tr.appendChild(kTd); tr.appendChild(vTd)
            coreTable.appendChild(tr)
          })
          detailSlot.appendChild(coreTable)

          // data_snapshot
          if (pack.data_snapshot) {
            const snapWrap = el("div", { style: { marginBottom: "12px" } })
            snapWrap.appendChild(el("div", { style: { fontWeight: "600", marginBottom: "4px", fontSize: "13px" } }, "data_snapshot"))
            const pre = el("pre", { style: { background: "#f8fafc", border: "1px solid #e2e8f0", padding: "10px", borderRadius: "4px", fontSize: "12px", overflowX: "auto", margin: "0" } })
            pre.textContent = JSON.stringify(pack.data_snapshot, null, 2)
            snapWrap.appendChild(pre)
            detailSlot.appendChild(snapWrap)
          }

          // Attached files
          if (pack.attached_files && pack.attached_files.length > 0) {
            const fWrap = el("div", { style: { marginBottom: "12px" } })
            fWrap.appendChild(el("div", { style: { fontWeight: "600", marginBottom: "4px", fontSize: "13px" } }, `Attached Files / الملفات المرفقة (${pack.attached_files.length})`))
            pack.attached_files.forEach(f => {
              const row = el("div", { class: "mono", style: { fontSize: "12px", padding: "3px 0" } })
              row.textContent = `${f.file_name || f.file_id} — ${f.uploaded_by} — ${fmt(f.uploaded_at)}`
              fWrap.appendChild(row)
            })
            detailSlot.appendChild(fWrap)
          }

          // Approval chain
          if (pack.approval_chain && pack.approval_chain.length > 0) {
            const aWrap = el("div", { style: { marginBottom: "12px" } })
            aWrap.appendChild(el("div", { style: { fontWeight: "600", marginBottom: "4px", fontSize: "13px" } }, `Approval Chain / سلسلة الموافقات (${pack.approval_chain.length})`))
            pack.approval_chain.forEach((a, i) => {
              const row = el("div", { style: { display: "flex", gap: "12px", fontSize: "12px", padding: "4px 0", borderBottom: "1px solid #f1f5f9" } })
              const stepBadge = el("span", { class: "mono", style: { minWidth: "24px", fontWeight: "600", color: "#3b82f6" } })
              stepBadge.textContent = `${i + 1}.`
              const decBadge = badge(a.decision, a.decision === "APPROVED" ? "#16a34a" : a.decision === "REJECTED" ? "#dc2626" : "#d97706")
              const info = el("span", { class: "mono" })
              info.textContent = `${a.approver_id} (${a.approver_role}) — ${fmt(a.timestamp)}`
              row.appendChild(stepBadge); row.appendChild(decBadge); row.appendChild(info)
              aWrap.appendChild(row)
            })
            detailSlot.appendChild(aWrap)
          }

          // AI artifacts
          if (pack.ai_artifacts && pack.ai_artifacts.length > 0) {
            const aiWrap = el("div", { style: { marginBottom: "12px" } })
            aiWrap.appendChild(el("div", { style: { fontWeight: "600", marginBottom: "4px", fontSize: "13px" } }, `AI Artifacts / مخرجات الذكاء الاصطناعي (${pack.ai_artifacts.length})`))
            pack.ai_artifacts.forEach(a => {
              const row = el("div", { class: "mono", style: { fontSize: "12px", padding: "3px 0" } })
              row.textContent = `model: ${a.model_version} | confidence: ${a.confidence ?? "—"} | ${fmt(a.recorded_at)}`
              aiWrap.appendChild(row)
            })
            detailSlot.appendChild(aiWrap)
          }

          // Redaction indicator
          if (pack._redaction_applied) {
            const rNote = el("div", { style: { marginTop: "8px", fontSize: "12px", color: "#94a3b8", fontStyle: "italic" } })
            rNote.textContent = `Redaction applied for role ${pack._requesting_role} — تم تطبيق قواعد الإخفاء`
            detailSlot.appendChild(rNote)
          }

          // Section C: Export controls for this pack
          renderExportControls(pack)
        })
        .catch(e => {
          detailSlot.innerHTML = `<div class="page-err">${e.message}</div>`
          toast.err(e.message)
        })
    }

    // ── Section C: export controls ──────────────────────────────────────────

    function renderExportControls(pack) {
      exportSlot.innerHTML = ""

      const canExport = pack.status === "CLOSED" || pack.status === "EXPORTED"
      if (!canExport) {
        exportSlot.appendChild(el("div", { style: { color: "#94a3b8", fontSize: "13px" } }, "Pack must be CLOSED before export / يجب إغلاق الحزمة قبل التصدير"))
        return
      }

      const row = el("div", { style: { display: "flex", gap: "8px", alignItems: "center" } })

      const mkExportBtn = (label, format) => {
        const btn = el("button", { class: "btn btn-primary" }, label)
        btn.addEventListener("click", () => exportPack(pack.pack_id, format))
        return btn
      }

      row.appendChild(mkExportBtn("Export JSON", "JSON"))
      row.appendChild(mkExportBtn("Export ZIP", "ZIP"))

      const slaNote = el("span", { style: { fontSize: "11px", color: "#94a3b8" } }, "SLA ≤60s")
      row.appendChild(slaNote)

      exportSlot.appendChild(row)
    }

    function exportPack(packId, format) {
      const role = roleSel.value
      const t0   = Date.now()

      toast.err(`Exporting ${format}… / جاري التصدير`)

      apiEvidencePost(`/api/evidence/packs/${packId}/export`, { format, requestingRole: role }, role)
        .then(async resp => {
          const generatedInMs = Number(resp.headers.get("x-generated-in-ms") || 0)
          const elapsed = Date.now() - t0

          if (format === "ZIP" || resp.headers.get("content-type") === "application/zip") {
            const blob = await resp.blob()
            const url  = URL.createObjectURL(blob)
            const a    = document.createElement("a")
            a.href = url; a.download = `${packId}.zip`; a.click()
            URL.revokeObjectURL(url)
            toast.err(`Exported ZIP in ${elapsed}ms / تم التصدير`)
          } else {
            const data = await resp.json()
            if (!data.ok) throw new Error((data.error || {}).message || "Export failed")
            const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" })
            const url  = URL.createObjectURL(blob)
            const a    = document.createElement("a")
            a.href = url; a.download = `${packId}.json`; a.click()
            URL.revokeObjectURL(url)
            toast.err(`Exported JSON in ${elapsed}ms (server: ${generatedInMs}ms) / تم التصدير`)
          }
          loadPacks()
        })
        .catch(e => toast.err("Export failed: " + e.message))
    }

    // Bulk export
    bulkExportBtn.addEventListener("click", () => {
      const ids = [...selectedIds]
      if (ids.length === 0) return
      const role = roleSel.value
      const t0   = Date.now()

      apiEvidencePost("/api/evidence/bulk-export", { pack_ids: ids, requestingRole: role }, role)
        .then(async resp => {
          const elapsed = Date.now() - t0
          if (resp.headers.get("content-type") === "application/zip") {
            const blob = await resp.blob()
            const url  = URL.createObjectURL(blob)
            const a    = document.createElement("a")
            a.href = url; a.download = `evidence_bulk_${Date.now()}.zip`; a.click()
            URL.revokeObjectURL(url)
            toast.err(`Bulk exported ${ids.length} packs in ${elapsed}ms / تم التصدير المجمع`)
            selectedIds.clear()
            updateBulkBar()
            loadPacks()
          } else {
            const data = await resp.json()
            toast.err("Bulk export error: " + ((data.error || {}).message || "unknown"))
          }
        })
        .catch(e => toast.err("Bulk export failed: " + e.message))
    })

    // ── Section D: audit trail ──────────────────────────────────────────────

    function loadAuditTrail() {
      apiEvidenceGet("/api/evidence/audit", roleSel.value)
        .then(data => {
          auditSlot.innerHTML = ""
          if (!data.ok) return

          const entries = data.data.entries || []
          if (entries.length === 0) {
            auditSlot.appendChild(el("div", { style: { color: "#94a3b8", fontSize: "13px" } }, "No audit events yet / لا توجد أحداث مراجعة"))
            return
          }

          auditSlot.appendChild(renderTable(
            [
              { key: "timestamp",  label: "Time / الوقت",         mono: true, render: v => fmt(v) },
              { key: "event",      label: "Event / الحدث",         mono: true },
              { key: "pack_id",    label: "Pack ID",               mono: true },
              { key: "actor_role", label: "Role / الدور",           mono: true },
            ],
            entries.slice().reverse(),  // newest first
            "No audit events / لا أحداث",
          ))
        })
        .catch(() => {})
    }

    // ── wire up events ──────────────────────────────────────────────────────

    applyBtn.addEventListener("click", () => renderPackTable())
    resetBtn.addEventListener("click", () => {
      typeInput.value   = ""
      statusInput.value = ""
      subjectInput.value = ""
      renderPackTable()
    })
    roleSel.addEventListener("change", () => {
      loadPacks()
      detailSlot.innerHTML = ""
      exportSlot.innerHTML = ""
    })

    // initial load
    loadPacks()
  }
}
