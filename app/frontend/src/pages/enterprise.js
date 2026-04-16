import { apiGet, apiPost, getTenant } from "../api.js"
import { toast } from "../components/toast.js"

const STATE_CLASS = {
  LIVE:                 "pass",
  READY_FOR_INTEGRATION:"pass",
  STAGED:               "gold",
  PLANNED:              "pending",
  PENDING:              "pending",
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">Enterprise Readiness</div>
      <div class="page-sub">Tenant: ${getTenant()} — RBAC · SSO/SAML · Audit Export · Procurement Controls</div>`

    const tabBar = document.createElement("div")
    tabBar.className = "tab-bar"
    tabBar.style.cssText = "display:flex;gap:4px;margin:16px 0 0"
    const TABS = [
      { key: "rbac",         label: "🔐 RBAC" },
      { key: "sso",          label: "🔑 SSO/SAML" },
      { key: "audit_export", label: "📤 Audit Export" },
      { key: "procurement",  label: "🏛 Procurement" },
    ]
    let activeTab = "rbac"
    const body = document.createElement("div")
    body.id = "ent-body"

    function renderTab(key) {
      activeTab = key
      tabBar.querySelectorAll(".tab").forEach(t => {
        t.className = "tab" + (t.dataset.key === key ? " active" : "")
      })
      renderTabBody(body, key)
    }

    TABS.forEach(({ key, label }) => {
      const t = document.createElement("a")
      t.className = "tab" + (key === activeTab ? " active" : "")
      t.href = "#"; t.textContent = label; t.dataset.key = key
      t.addEventListener("click", e => { e.preventDefault(); renderTab(key) })
      tabBar.appendChild(t)
    })

    container.appendChild(tabBar)
    container.appendChild(body)
    renderTab("rbac")
  }
}

function renderTabBody(body, tab) {
  body.innerHTML = '<div class="page-load">Loading…</div>'
  if (tab === "rbac")         renderRbacTab(body)
  else if (tab === "sso")     renderSsoTab(body)
  else if (tab === "audit_export") renderAuditExportTab(body)
  else if (tab === "procurement")  renderProcurementTab(body)
}

// ── RBAC Tab ─────────────────────────────────────────────────────────────────
function renderRbacTab(body) {
  apiGet("/api/admin/enterprise/config")
    .then(cfg => {
      body.innerHTML = ""
      const rbac = cfg.rbac

      // Readiness strip
      const strip = document.createElement("div")
      strip.className = "kpi-strip"
      strip.style.marginBottom = "20px"
      ;[
        ["Role Enforcement",  rbac.role_enforcement],
        ["Tenant Safe",       rbac.tenant_safe ? "YES" : "NO"],
        ["Model Version",     rbac.model_version],
        ["Enterprise Ready",  cfg.enterprise_readiness],
      ].forEach(([label, val]) => {
        const k = document.createElement("div")
        k.className = "kpi-item"
        k.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value">${val}</div>`
        strip.appendChild(k)
      })
      body.appendChild(strip)

      // Role matrix card
      const card = document.createElement("div")
      card.className = "card"
      card.innerHTML = `<div class="card-title">🔐 Enterprise Role Matrix</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:14px">${rbac.note}</div>`

      // Enterprise roles first (non-legacy), then legacy
      const enterpriseRoles = rbac.roles.filter(r => !["superadmin","ops","auditor"].includes(r.id))
      const legacyRoles     = rbac.roles.filter(r =>  ["superadmin","ops","auditor"].includes(r.id))

      renderRoleGroup(card, "Enterprise Roles", enterpriseRoles)

      const legacyToggle = document.createElement("div")
      legacyToggle.style.cssText = "margin-top:14px"
      const legacyBtn = document.createElement("button")
      legacyBtn.className = "btn"
      legacyBtn.style.cssText = "font-size:12px;padding:4px 10px"
      legacyBtn.textContent = "▶ Show Legacy Roles"
      let legacyVisible = false
      const legacyBody = document.createElement("div")
      legacyBody.style.display = "none"
      legacyBtn.addEventListener("click", () => {
        legacyVisible = !legacyVisible
        legacyBody.style.display = legacyVisible ? "" : "none"
        legacyBtn.textContent = (legacyVisible ? "▼" : "▶") + " Show Legacy Roles"
      })
      renderRoleGroup(legacyBody, "Legacy Roles (preserved for existing principals)", legacyRoles)
      legacyToggle.appendChild(legacyBtn)
      legacyToggle.appendChild(legacyBody)
      card.appendChild(legacyToggle)
      body.appendChild(card)
    })
    .catch(e => { body.innerHTML = `<div class="page-err">${e.message}</div>` })
}

function renderRoleGroup(container, title, roles) {
  const section = document.createElement("div")
  section.style.cssText = "margin-bottom:8px"
  const heading = document.createElement("div")
  heading.style.cssText = "font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin:12px 0 8px"
  heading.textContent = title
  section.appendChild(heading)
  roles.forEach(role => {
    const row = document.createElement("div")
    row.style.cssText = "display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);align-items:flex-start"
    row.innerHTML = `
      <div style="min-width:140px">
        <div style="font-weight:600;font-size:13px">${role.label}</div>
        <div style="margin-top:4px"><span class="ep-status ${STATE_CLASS[role.state] || "pending"}">${role.state}</span></div>
      </div>
      <div style="flex:1">
        <div style="font-size:13px;color:var(--text);margin-bottom:4px">${role.description}</div>
        <div style="font-size:12px;color:var(--muted)">${role.capabilities.join(" · ")}</div>
      </div>`
    section.appendChild(row)
  })
  container.appendChild(section)
}

// ── SSO/SAML Tab ─────────────────────────────────────────────────────────────
function renderSsoTab(body) {
  Promise.all([
    apiGet("/api/admin/enterprise/config"),
    apiGet("/api/admin/enterprise/sso-config"),
  ]).then(([cfg, ssoState]) => {
    body.innerHTML = ""
    const sso = cfg.sso_saml

    // Readiness strip
    const strip = document.createElement("div")
    strip.className = "kpi-strip"
    strip.style.marginBottom = "20px"
    ;[
      ["SSO State",        sso.sso_state],
      ["SAML State",       sso.saml_state],
      ["IdP Config",       sso.idp_config_state],
      ["Domain Config",    sso.domain_config],
    ].forEach(([label, val]) => {
      const k = document.createElement("div")
      k.className = "kpi-item"
      k.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value">${val}</div>`
      strip.appendChild(k)
    })
    body.appendChild(strip)

    // Providers table
    const provCard = document.createElement("div")
    provCard.className = "card"
    provCard.innerHTML = `<div class="card-title">🔑 Identity Provider (IdP) Readiness</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:14px">${sso.next_action}</div>`
    const tbl = document.createElement("table")
    tbl.style.cssText = "width:100%;border-collapse:collapse;font-size:13px"
    tbl.innerHTML = `<thead><tr style="border-bottom:1px solid var(--border)">
      <th style="text-align:left;padding:6px 4px;color:var(--muted)">Provider</th>
      <th style="text-align:left;padding:6px 4px;color:var(--muted)">Features</th>
      <th style="text-align:left;padding:6px 4px;color:var(--muted)">State</th>
    </tr></thead>`
    const tbody = document.createElement("tbody")
    sso.providers.forEach(p => {
      const tr = document.createElement("tr")
      tr.style.borderBottom = "1px solid var(--border)"
      tr.innerHTML = `
        <td style="padding:8px 4px;font-weight:600">${p.name}</td>
        <td style="padding:8px 4px;color:var(--muted)">${p.features.join(", ")}</td>
        <td style="padding:8px 4px"><span class="ep-status ${STATE_CLASS[p.state] || "pending"}">${p.state}</span></td>`
      tbody.appendChild(tr)
    })
    tbl.appendChild(tbody)
    provCard.appendChild(tbl)
    body.appendChild(provCard)

    // IdP config form
    const configCard = document.createElement("div")
    configCard.className = "card"
    configCard.style.marginTop = "16px"
    configCard.innerHTML = `<div class="card-title">⚙️ IdP Configuration</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:14px">
        Configure your Identity Provider. Fields are STAGED — connection will activate on validation.
      </div>`
    const fields = [
      { name: "idp_type",   label: "IdP Type (okta/azure_ad/saml2)",     value: ssoState.idp_type || "" },
      { name: "entity_id",  label: "IdP Entity ID",                       value: ssoState.entity_id || "" },
      { name: "sso_url",    label: "SSO / ACS URL",                       value: ssoState.sso_url || "" },
      { name: "domain",     label: "Verified Domain",                     value: ssoState.domain || "" },
    ]
    const form = document.createElement("form")
    form.style.cssText = "display:flex;flex-direction:column;gap:12px"
    fields.forEach(f => {
      const wrap = document.createElement("div")
      wrap.style.cssText = "display:flex;flex-direction:column;gap:4px"
      wrap.innerHTML = `<label style="font-size:13px;color:var(--muted)">${f.label}</label>`
      const input = document.createElement("input")
      input.type = "text"; input.name = f.name; input.value = f.value
      input.style.cssText = "background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:13px"
      wrap.appendChild(input)
      form.appendChild(wrap)
    })
    // cert textarea
    const certWrap = document.createElement("div")
    certWrap.style.cssText = "display:flex;flex-direction:column;gap:4px"
    certWrap.innerHTML = `<label style="font-size:13px;color:var(--muted)">X.509 Certificate (PEM)</label>`
    const certArea = document.createElement("textarea")
    certArea.name = "certificate"
    certArea.rows = 4
    certArea.placeholder = ssoState.certificate ? "[CONFIGURED — paste new cert to replace]" : "-----BEGIN CERTIFICATE-----\n..."
    certArea.style.cssText = "background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:12px;font-family:monospace;resize:vertical"
    certWrap.appendChild(certArea)
    form.appendChild(certWrap)

    const note = document.createElement("div")
    note.style.cssText = "font-size:12px;color:var(--muted);background:var(--bg);border-radius:8px;padding:10px 12px"
    note.textContent = `Current state: ${ssoState.state || "STAGED"} · Last updated: ${ssoState.updated_at || "never"}`
    form.appendChild(note)

    const saveBtn = document.createElement("button")
    saveBtn.type = "submit"; saveBtn.className = "btn btn-primary"
    saveBtn.style.cssText = "align-self:flex-start"
    saveBtn.textContent = "Save SSO Config (STAGED)"
    form.addEventListener("submit", async e => {
      e.preventDefault()
      saveBtn.disabled = true; saveBtn.textContent = "Saving…"
      const body2 = {}
      fields.forEach(f => { body2[f.name] = form.elements[f.name]?.value || null })
      if (certArea.value.trim()) body2.certificate = certArea.value.trim()
      try {
        await fetch("/api/admin/enterprise/sso-config", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + (localStorage.getItem("pw_token") || ""),
            "x-tenant-id": localStorage.getItem("pw_tenant") || "default",
          },
          body: JSON.stringify(body2),
        })
        toast.ok("SSO config saved (STAGED)")
        renderSsoTab(document.getElementById("ent-body") || body.parentElement || body)
      } catch (err) {
        toast.err(err.message)
      } finally {
        saveBtn.disabled = false; saveBtn.textContent = "Save SSO Config (STAGED)"
      }
    })
    form.appendChild(saveBtn)
    configCard.appendChild(form)
    body.appendChild(configCard)
  }).catch(e => { body.innerHTML = `<div class="page-err">${e.message}</div>` })
}

// ── Audit Export Tab ──────────────────────────────────────────────────────────
function renderAuditExportTab(body) {
  apiGet("/api/admin/enterprise/audit-export")
    .then(data => {
      body.innerHTML = ""

      const infoCard = document.createElement("div")
      infoCard.className = "card"
      infoCard.style.marginBottom = "16px"
      infoCard.innerHTML = `
        <div class="card-title">📤 Audit Export Categories</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:12px">
          ${data.role_note}
        </div>
        <div style="font-size:12px;color:var(--muted)">
          Format: ${data.export_format} &nbsp;·&nbsp; Last export: ${data.last_export_ts ? new Date(data.last_export_ts).toLocaleString() : "never"}
        </div>`

      // Category selection
      const selList = document.createElement("div")
      selList.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-top:16px"
      const selected = new Set(data.categories.filter(c => c.available).map(c => c.id))

      data.categories.forEach(cat => {
        const row = document.createElement("div")
        row.style.cssText = "display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)"
        const cb = document.createElement("input")
        cb.type = "checkbox"; cb.id = "cat_" + cat.id; cb.checked = cat.available
        cb.disabled = !cat.available
        if (!cat.available) selected.delete(cat.id)
        cb.addEventListener("change", () => {
          if (cb.checked) selected.add(cat.id)
          else selected.delete(cat.id)
        })
        row.innerHTML = `
          <div style="flex:1">
            <label for="cat_${cat.id}" style="font-weight:600;font-size:13px;cursor:pointer">${cat.label}</label>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">${cat.description}</div>
          </div>
          <span class="ep-status ${cat.available ? "pass" : "pending"}" style="min-width:50px;text-align:center">${cat.count} records</span>`
        row.prepend(cb)
        selList.appendChild(row)
      })
      infoCard.appendChild(selList)

      const exportBtn = document.createElement("button")
      exportBtn.className = "btn btn-gold"
      exportBtn.style.cssText = "margin-top:16px;align-self:flex-start"
      exportBtn.textContent = "⬇ Export Selected"
      exportBtn.addEventListener("click", async () => {
        exportBtn.disabled = true; exportBtn.textContent = "Exporting…"
        try {
          const resp = await fetch("/api/admin/enterprise/audit-export", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + (localStorage.getItem("pw_token") || ""),
              "x-tenant-id": localStorage.getItem("pw_tenant") || "default",
            },
            body: JSON.stringify({ categories: Array.from(selected) }),
          })
          if (!resp.ok) throw new Error("Export failed: " + resp.status)
          const result = await resp.json()
          const blob = new Blob([JSON.stringify(result.data?.payload || result.data, null, 2)], { type: "application/json" })
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = `enterprise-audit-export-${getTenant()}-${Date.now()}.json`
          a.click()
          URL.revokeObjectURL(url)
          toast.ok("Export downloaded")
        } catch (err) {
          toast.err(err.message)
        } finally {
          exportBtn.disabled = false; exportBtn.textContent = "⬇ Export Selected"
        }
      })
      infoCard.appendChild(exportBtn)
      body.appendChild(infoCard)
    })
    .catch(e => { body.innerHTML = `<div class="page-err">${e.message}</div>` })
}

// ── Procurement Controls Tab ──────────────────────────────────────────────────
function renderProcurementTab(body) {
  apiGet("/api/admin/enterprise/config")
    .then(cfg => {
      body.innerHTML = ""
      const proc = cfg.procurement

      // Readiness strip
      const liveCount    = Object.values(proc).filter(v => v.status === "LIVE").length
      const stagedCount  = Object.values(proc).filter(v => v.status === "STAGED").length
      const plannedCount = Object.values(proc).filter(v => v.status === "PLANNED").length
      const strip = document.createElement("div")
      strip.className = "kpi-strip"
      strip.style.marginBottom = "20px"
      ;[
        ["Controls LIVE",     liveCount],
        ["Controls STAGED",   stagedCount],
        ["Controls PLANNED",  plannedCount],
        ["Enterprise Ready",  cfg.enterprise_readiness],
      ].forEach(([label, val]) => {
        const k = document.createElement("div")
        k.className = "kpi-item"
        k.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value">${val}</div>`
        strip.appendChild(k)
      })
      body.appendChild(strip)

      // Controls checklist
      const card = document.createElement("div")
      card.className = "card"
      card.innerHTML = `<div class="card-title">🏛 Procurement Readiness Controls</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:14px">
          Due-diligence posture for enterprise procurement review.
          All states are truthful — STAGED controls are in active progress, PLANNED are on roadmap.
        </div>`

      const CONTROL_LABELS = {
        data_residency:        { icon: "🌍", label: "Data Residency" },
        access_control:        { icon: "🔐", label: "Access Control (RBAC)" },
        audit_export:          { icon: "📤", label: "Audit Export" },
        encryption_at_rest:    { icon: "🔒", label: "Encryption at Rest" },
        encryption_in_transit: { icon: "🔐", label: "Encryption in Transit" },
        gdpr_pdpl_posture:     { icon: "⚖️", label: "GDPR / PDPL Posture" },
        soc2_posture:          { icon: "📋", label: "SOC 2 Posture" },
        pen_test:              { icon: "🛡",  label: "Penetration Testing" },
        dpa_readiness:         { icon: "📄", label: "DPA Readiness" },
        sla:                   { icon: "⏱",  label: "SLA Commitment" },
      }

      const list = document.createElement("div")
      list.className = "check-list"
      Object.entries(proc).forEach(([key, ctrl]) => {
        const meta = CONTROL_LABELS[key] || { icon: "✅", label: key }
        const row = document.createElement("div")
        row.className = "check-item"
        row.style.cssText = "align-items:flex-start;padding:10px 0"
        row.innerHTML = `
          <div class="check-icon" style="flex-shrink:0">${meta.icon}</div>
          <div class="check-text" style="flex:1">
            <strong>${meta.label}</strong>
            <div style="font-size:12px;color:var(--muted);margin-top:3px">${ctrl.note}</div>
          </div>
          <div class="check-status ${STATE_CLASS[ctrl.status] || "pending"}" style="flex-shrink:0">${ctrl.status}</div>`
        list.appendChild(row)
      })
      card.appendChild(list)
      body.appendChild(card)

      // Buyer note
      const noteCard = document.createElement("div")
      noteCard.className = "card"
      noteCard.style.marginTop = "16px"
      noteCard.innerHTML = `
        <div class="card-title">💬 Enterprise Buyer Notes</div>
        <div style="display:flex;flex-direction:column;gap:10px;font-size:13px">
          <div>
            <strong>Truthful state model:</strong>
            <span style="color:var(--muted)"> LIVE = deployed and enforced · STAGED = implemented but not fully activated · PLANNED = roadmap with timeline</span>
          </div>
          <div>
            <strong>Data access:</strong>
            <span style="color:var(--muted)"> All API access is tenant-isolated, role-gated, and audit-logged. No cross-tenant data leakage by design.</span>
          </div>
          <div>
            <strong>Export availability:</strong>
            <span style="color:var(--muted)"> Audit logs, evidence packs, identity summaries, PDPL register, and workforce roster are available for download under ENTERPRISE_EXPORT permission.</span>
          </div>
          <div>
            <strong>Next enterprise actions:</strong>
            <span style="color:var(--muted)"> Complete SSO/SAML IdP configuration, progress data residency attestation, initiate SOC 2 gap assessment, execute DPA with first enterprise customer.</span>
          </div>
        </div>`
      body.appendChild(noteCard)
    })
    .catch(e => { body.innerHTML = `<div class="page-err">${e.message}</div>` })
}
