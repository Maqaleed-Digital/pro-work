// WC-CB Day 4 (D-2, 2026-05-14): Settings surface per brief §3.6.
//
// Authority:
//   - brief §3.6 — "Organisation profile (edit). Users (admin-level;
//     invite additional org members if backend supports). Locale
//     preference. Notification preferences. Billing placeholder (display
//     only — no payment in controlled beta)."
//   - PROPOSAL §11.A4 NO PHANTOM FEATURES: notification preferences
//     and billing surfaces are labelled "Unavailable in beta" /
//     "Coming later" with disabled controls — they are HONEST about
//     the backend gap, not silently broken.
//
// Layout: tabbed sidebar (5 sections). Each tab is a discrete render
// function so they can later be split into separate routes if needed.
//
// Brand-neutral per PROPOSAL §11.A5.

import { t, getLocale, setLocale } from "../locale.js"
import { applyLocaleToDocument } from "../components/language_toggle.js"
import { getOnboardingStatus, updateOnboardingProfile } from "../api/onboarding.js"
import { listInvitations, createInvitation, revokeInvitation } from "../api/invitations.js"
import { renderModeStatusChip } from "../components/mode_status_chip.js"

const TABS = [
  { key: "profile",       icon: "🏢" },
  { key: "users",         icon: "👥" },
  { key: "locale",        icon: "🌐" },
  { key: "notifications", icon: "🔔", betaUnavailable: true },
  { key: "billing",       icon: "💳", betaUnavailable: true },
]

let _activeTab = "profile"

function render(el) {
  el.innerHTML = ""
  const locale = getLocale()

  const wrap = document.createElement("div")
  wrap.className = "content-area"

  const header = document.createElement("header")
  header.className = "page-header"
  const headerText = document.createElement("div")
  headerText.className = "page-header-text"
  const title = document.createElement("h1")
  title.textContent = t("settings.title")
  headerText.appendChild(title)
  const subtitle = document.createElement("p")
  subtitle.textContent = t("settings.subtitle")
  headerText.appendChild(subtitle)
  header.appendChild(headerText)
  wrap.appendChild(header)

  // ── Tab layout (sidebar + panel) ───────────────────────────────────
  const layout = document.createElement("div")
  layout.style.cssText = [
    "display:grid",
    "grid-template-columns: minmax(220px, 280px) 1fr",
    "gap: var(--maq-space-6)",
    "padding-inline: var(--maq-space-4)",
    "align-items: start",
  ].join(";")

  // Tab list
  const tabList = document.createElement("nav")
  tabList.setAttribute("role", "tablist")
  tabList.setAttribute("aria-label", t("settings.title"))
  tabList.style.cssText = "display:flex;flex-direction:column;gap:var(--maq-space-1)"

  const panel = document.createElement("section")
  panel.setAttribute("role", "tabpanel")
  panel.setAttribute("aria-live", "polite")

  for (const tab of TABS) {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.setAttribute("role", "tab")
    btn.setAttribute("data-tab", tab.key)
    btn.setAttribute("aria-selected", String(tab.key === _activeTab))
    btn.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:var(--maq-space-3)",
      "padding:var(--maq-space-3) var(--maq-space-4)",
      "background: " + (tab.key === _activeTab ? "var(--maq-brand-primary-bg)" : "transparent"),
      "color: " + (tab.key === _activeTab ? "var(--maq-brand-primary)" : "var(--maq-neutral-700)"),
      "border: 1px solid " + (tab.key === _activeTab ? "var(--maq-brand-primary)" : "transparent"),
      "border-radius: var(--maq-radius-md)",
      "font-family: inherit",
      "font-size: var(--maq-text-sm)",
      "font-weight: " + (tab.key === _activeTab ? "var(--maq-weight-semibold)" : "var(--maq-weight-medium)"),
      "cursor: pointer",
      "text-align: start",
      "min-height: 40px",
    ].join(";")
    const ic = document.createElement("span"); ic.setAttribute("aria-hidden", "true"); ic.textContent = tab.icon
    const lbl = document.createElement("span"); lbl.textContent = t(`settings.tab.${tab.key}`)
    btn.appendChild(ic); btn.appendChild(lbl)
    if (tab.betaUnavailable) {
      const badge = document.createElement("span")
      badge.textContent = locale === "ar" ? "غير متاح" : "Beta"
      badge.style.cssText = "margin-inline-start:auto;padding:0 var(--maq-space-2);background:var(--maq-mode-d-bg);color:var(--maq-mode-d);border-radius:var(--maq-radius-sm);font-size:var(--maq-text-xs);font-weight:var(--maq-weight-medium)"
      btn.appendChild(badge)
    }
    btn.addEventListener("click", () => {
      _activeTab = tab.key
      // Re-render to update tab states + panel content
      render(el)
    })
    tabList.appendChild(btn)
  }

  layout.appendChild(tabList)
  layout.appendChild(panel)
  wrap.appendChild(layout)
  el.appendChild(wrap)

  // Render the active tab into panel.
  switch (_activeTab) {
    case "users":          return renderUsersTab(panel, locale)
    case "locale":         return renderLocaleTab(panel, locale, el)
    case "notifications":  return renderNotificationsTab(panel, locale)
    case "billing":        return renderBillingTab(panel, locale)
    case "profile":
    default:               return renderProfileTab(panel, locale)
  }
}

// ── Tab: Organisation profile ─────────────────────────────────────────
async function renderProfileTab(panel, locale) {
  panel.innerHTML = panelHeading(t("settings.profile.title"), t("settings.profile.subtitle"))

  const formContainer = document.createElement("div")
  panel.appendChild(formContainer)

  // Skeleton
  formContainer.innerHTML = `<p style="color:var(--maq-neutral-500)">${t("common.loading")}</p>`

  let status
  try {
    status = await getOnboardingStatus()
  } catch (e) {
    formContainer.innerHTML = ""
    formContainer.appendChild(renderErrorBox(e, locale))
    return
  }
  const p = status.profile || {}

  formContainer.innerHTML = ""

  function row(labelKey, value, mono) {
    const r = document.createElement("div")
    r.style.cssText = "display:flex;justify-content:space-between;gap:var(--maq-space-4);padding-block:var(--maq-space-3);border-block-end:1px solid var(--maq-neutral-200)"
    const lbl = document.createElement("span")
    lbl.style.cssText = "color:var(--maq-neutral-600);font-size:var(--maq-text-sm)"
    lbl.textContent = t(labelKey)
    const val = document.createElement("span")
    val.style.cssText = "color:var(--maq-neutral-900);font-weight:var(--maq-weight-medium)" + (mono ? ";font-family:var(--maq-font-mono)" : "")
    val.textContent = value == null || value === "" ? "—" : String(value)
    r.appendChild(lbl); r.appendChild(val)
    return r
  }

  const useCaseDisplay = p.primaryUseCase
    ? (locale === "ar"
        ? { saudisation: "السعودة", payroll: "الرواتب", both: "كلاهما" }[p.primaryUseCase]
        : { saudisation: "Saudisation", payroll: "Payroll", both: "Both" }[p.primaryUseCase])
    : null

  formContainer.appendChild(row("settings.profile.orgName", p.orgName))
  formContainer.appendChild(row("settings.profile.crNumber", p.crNumber, true))
  formContainer.appendChild(row("settings.profile.primaryUseCase", useCaseDisplay))
  formContainer.appendChild(row("settings.profile.teamSize", p.teamSize))
  formContainer.appendChild(row("settings.profile.preferredLocale", p.preferredLocale === "ar" ? (locale === "ar" ? "العربية" : "Arabic") : (locale === "ar" ? "الإنجليزية" : "English")))

  const editLink = document.createElement("a")
  editLink.href = "#onboarding"
  editLink.textContent = t("settings.profile.edit")
  editLink.style.cssText = "display:inline-block;margin-block-start:var(--maq-space-4);color:var(--maq-brand-primary);text-decoration:underline;font-size:var(--maq-text-sm);font-weight:var(--maq-weight-medium)"
  formContainer.appendChild(editLink)

  // PDPL consent status
  if (p.pdplConsent) {
    const consentBox = document.createElement("div")
    consentBox.style.cssText = "margin-block-start:var(--maq-space-6);padding:var(--maq-space-3);background:var(--maq-semantic-info-bg);border-radius:var(--maq-radius-md);border-inline-start:4px solid var(--maq-semantic-info)"
    const ch = document.createElement("p"); ch.style.cssText = "margin:0 0 var(--maq-space-1);font-weight:var(--maq-weight-medium)"
    ch.textContent = t("settings.profile.pdplConsentTitle")
    consentBox.appendChild(ch)
    const cb = document.createElement("p"); cb.style.cssText = "margin:0;font-size:var(--maq-text-sm);color:var(--maq-neutral-700)"
    const grantedAt = p.pdplConsent.granted_at || p.pdplConsent.grantedAt
    cb.textContent = (locale === "ar" ? "ممنوحة في " : "Granted on ") + (grantedAt ? new Date(grantedAt).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB") : "—")
    consentBox.appendChild(cb)
    formContainer.appendChild(consentBox)
  }
}

// ── Tab: Users (invitations) ─────────────────────────────────────────
async function renderUsersTab(panel, locale) {
  panel.innerHTML = panelHeading(t("settings.users.title"), t("settings.users.subtitle"))

  // Invite form
  const inviteForm = document.createElement("form")
  inviteForm.addEventListener("submit", e => e.preventDefault())
  inviteForm.style.cssText = "display:flex;gap:var(--maq-space-2);align-items:flex-end;flex-wrap:wrap;margin-block-end:var(--maq-space-4);padding:var(--maq-space-4);background:var(--maq-neutral-50);border-radius:var(--maq-radius-md)"
  const inviteEmail = document.createElement("input")
  inviteEmail.type = "email"; inviteEmail.placeholder = "colleague@company.com"; inviteEmail.required = true
  inviteEmail.setAttribute("aria-label", t("settings.users.emailLabel"))
  inviteEmail.style.cssText = "flex:1;min-inline-size:240px;padding:var(--maq-space-2) var(--maq-space-3);border:1px solid var(--maq-neutral-300);border-radius:var(--maq-radius-md);font-family:inherit;font-size:var(--maq-text-sm)"
  const inviteRole = document.createElement("select")
  inviteRole.style.cssText = "padding:var(--maq-space-2) var(--maq-space-3);border:1px solid var(--maq-neutral-300);border-radius:var(--maq-radius-md);font-family:inherit;font-size:var(--maq-text-sm)"
  inviteRole.setAttribute("aria-label", t("settings.users.roleLabel"))
  for (const r of ["ADMIN", "MANAGER", "VIEWER"]) {
    const opt = document.createElement("option"); opt.value = r; opt.textContent = r
    inviteRole.appendChild(opt)
  }
  const inviteBtn = document.createElement("button")
  inviteBtn.type = "submit"; inviteBtn.className = "btn btn-accent"
  inviteBtn.textContent = t("settings.users.sendInvite")
  inviteBtn.style.cssText = "min-height:38px;padding-inline:var(--maq-space-4)"
  inviteForm.appendChild(inviteEmail); inviteForm.appendChild(inviteRole); inviteForm.appendChild(inviteBtn)

  const inviteErr = document.createElement("p")
  inviteErr.setAttribute("role", "alert"); inviteErr.setAttribute("aria-live", "polite")
  inviteErr.style.cssText = "margin:0;min-height:1em;color:var(--maq-semantic-danger);font-size:var(--maq-text-sm)"

  panel.appendChild(inviteForm)
  panel.appendChild(inviteErr)

  // Invitations list
  const list = document.createElement("div")
  list.innerHTML = `<p style="color:var(--maq-neutral-500)">${t("common.loading")}</p>`
  panel.appendChild(list)

  async function refresh() {
    try {
      const { invitations } = await listInvitations()
      renderInvitationsList(list, invitations, locale, refresh)
    } catch (e) {
      list.innerHTML = ""
      list.appendChild(renderErrorBox(e, locale))
    }
  }

  inviteBtn.addEventListener("click", async () => {
    inviteErr.textContent = ""
    const email = (inviteEmail.value || "").trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      inviteErr.textContent = t("settings.users.err.emailInvalid"); return
    }
    inviteBtn.disabled = true
    inviteBtn.textContent = t("common.loading")
    try {
      await createInvitation(email, inviteRole.value)
      inviteEmail.value = ""
      await refresh()
    } catch (e) {
      inviteErr.textContent = e.message || t("settings.users.err.failed")
    } finally {
      inviteBtn.disabled = false
      inviteBtn.textContent = t("settings.users.sendInvite")
    }
  })

  refresh()
}

function renderInvitationsList(list, invitations, locale, refresh) {
  list.innerHTML = ""
  if (!invitations || invitations.length === 0) {
    const empty = document.createElement("p")
    empty.style.cssText = "padding:var(--maq-space-6);text-align:center;color:var(--maq-neutral-500)"
    empty.textContent = t("settings.users.empty")
    list.appendChild(empty)
    return
  }
  const table = document.createElement("div")
  table.style.cssText = "display:flex;flex-direction:column;gap:var(--maq-space-2)"
  for (const inv of invitations) {
    const row = document.createElement("div")
    row.style.cssText = "display:flex;align-items:center;gap:var(--maq-space-3);padding:var(--maq-space-3);background:var(--maq-neutral-0);border:1px solid var(--maq-neutral-200);border-radius:var(--maq-radius-md)"
    const em = document.createElement("span")
    em.style.cssText = "flex:1;font-weight:var(--maq-weight-medium)"
    em.textContent = inv.email
    const role = document.createElement("span")
    role.style.cssText = "padding-inline:var(--maq-space-2);padding-block:2px;background:var(--maq-neutral-100);color:var(--maq-neutral-700);border-radius:var(--maq-radius-sm);font-size:var(--maq-text-xs);font-weight:var(--maq-weight-medium)"
    role.textContent = inv.role
    const status = document.createElement("span")
    const isAccepted = !!inv.acceptedAt
    const isRevoked = !!inv.revokedAt
    status.style.cssText = "font-size:var(--maq-text-xs);color:" + (isAccepted ? "var(--maq-semantic-success)" : isRevoked ? "var(--maq-neutral-500)" : "var(--maq-semantic-warning)")
    status.textContent = isAccepted ? t("settings.users.accepted") : isRevoked ? t("settings.users.revoked") : t("settings.users.pending")
    row.appendChild(em); row.appendChild(role); row.appendChild(status)
    if (!isAccepted && !isRevoked) {
      const revokeBtn = document.createElement("button")
      revokeBtn.type = "button"
      revokeBtn.textContent = t("settings.users.revoke")
      revokeBtn.style.cssText = "padding:var(--maq-space-1) var(--maq-space-3);background:transparent;color:var(--maq-semantic-danger);border:1px solid var(--maq-semantic-danger);border-radius:var(--maq-radius-sm);cursor:pointer;font-family:inherit;font-size:var(--maq-text-xs)"
      revokeBtn.addEventListener("click", async () => {
        if (!confirm(t("settings.users.confirmRevoke"))) return
        try { await revokeInvitation(inv.id); await refresh() }
        catch { /* silent — user can retry */ }
      })
      row.appendChild(revokeBtn)
    }
    table.appendChild(row)
  }
  list.appendChild(table)
}

// ── Tab: Locale preference ────────────────────────────────────────────
function renderLocaleTab(panel, locale, rootEl) {
  panel.innerHTML = panelHeading(t("settings.locale.title"), t("settings.locale.subtitle"))

  const options = [
    { value: "en", labelKey: "settings.locale.en" },
    { value: "ar", labelKey: "settings.locale.ar" },
  ]

  const list = document.createElement("div")
  list.style.cssText = "display:flex;flex-direction:column;gap:var(--maq-space-2);max-inline-size:480px"
  panel.appendChild(list)

  for (const opt of options) {
    const row = document.createElement("label")
    row.style.cssText = "display:flex;align-items:center;gap:var(--maq-space-3);padding:var(--maq-space-3);background:" + (opt.value === locale ? "var(--maq-brand-primary-bg)" : "var(--maq-neutral-0)") + ";border:1px solid " + (opt.value === locale ? "var(--maq-brand-primary)" : "var(--maq-neutral-200)") + ";border-radius:var(--maq-radius-md);cursor:pointer"
    const radio = document.createElement("input")
    radio.type = "radio"; radio.name = "locale"; radio.value = opt.value; radio.checked = opt.value === locale
    radio.addEventListener("change", async () => {
      await setLocale(opt.value)
      applyLocaleToDocument()
      // Persist to backend tenant config too (best-effort; silent on failure).
      try { await updateOnboardingProfile({ preferredLocale: opt.value }) } catch {}
      render(rootEl)
    })
    const label = document.createElement("span")
    label.textContent = t(opt.labelKey)
    row.appendChild(radio); row.appendChild(label)
    list.appendChild(row)
  }
}

// ── Tab: Notifications (Coming later per §11.A4) ─────────────────────
function renderNotificationsTab(panel, locale) {
  panel.innerHTML = panelHeading(t("settings.notifications.title"), t("settings.notifications.subtitle"))
  panel.appendChild(renderBetaPlaceholder(
    t("settings.notifications.placeholderBody"),
    locale
  ))
}

// ── Tab: Billing (Unavailable in beta per RM-001 §10.1) ──────────────
function renderBillingTab(panel, locale) {
  panel.innerHTML = panelHeading(t("settings.billing.title"), t("settings.billing.subtitle"))

  const card = document.createElement("article")
  card.style.cssText = [
    "background: var(--maq-mode-d-bg)",
    "color: var(--maq-mode-d)",
    "border: 1px solid var(--maq-mode-d)",
    "border-radius: var(--maq-radius-md)",
    "padding: var(--maq-space-4)",
    "display: flex",
    "align-items: start",
    "gap: var(--maq-space-3)",
  ].join(";")
  const icon = document.createElement("span"); icon.setAttribute("aria-hidden", "true"); icon.textContent = "💳"; icon.style.fontSize = "var(--maq-text-2xl)"
  card.appendChild(icon)
  const body = document.createElement("div")
  body.style.cssText = "flex:1"
  const t1 = document.createElement("p"); t1.style.cssText = "margin:0 0 var(--maq-space-2);font-weight:var(--maq-weight-semibold)"
  t1.textContent = t("settings.billing.unavailableTitle")
  body.appendChild(t1)
  const t2 = document.createElement("p"); t2.style.cssText = "margin:0;font-size:var(--maq-text-sm);color:var(--maq-neutral-700);line-height:var(--maq-leading-relaxed)"
  t2.textContent = t("settings.billing.unavailableBody")
  body.appendChild(t2)
  card.appendChild(body)
  card.appendChild(renderModeStatusChip({ mode: "D", capabilityName: "billing", locale }))
  panel.appendChild(card)
}

// ── Helpers ──────────────────────────────────────────────────────────
function panelHeading(title, subtitle) {
  return `
    <header style="margin-block-end:var(--maq-space-5)">
      <h2 style="font-size:var(--maq-text-xl);font-weight:var(--maq-weight-semibold);margin:0 0 var(--maq-space-1);color:var(--maq-neutral-900)">${escapeHtml(title)}</h2>
      <p style="margin:0;color:var(--maq-neutral-600);font-size:var(--maq-text-sm)">${escapeHtml(subtitle)}</p>
    </header>
  `
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))
}

function renderErrorBox(e, locale) {
  const box = document.createElement("div")
  box.setAttribute("role", "alert")
  box.style.cssText = "padding:var(--maq-space-4);background:var(--maq-semantic-danger-bg);color:var(--maq-semantic-danger);border:1px solid var(--maq-semantic-danger);border-radius:var(--maq-radius-md)"
  const h = document.createElement("p"); h.style.cssText = "margin:0 0 var(--maq-space-1);font-weight:var(--maq-weight-semibold)"
  h.textContent = locale === "ar" ? "تعذّر التحميل" : "Couldn't load"
  box.appendChild(h)
  const body = document.createElement("p"); body.style.cssText = "margin:0;font-size:var(--maq-text-sm)"
  body.textContent = e && e.code === "FORBIDDEN"
    ? (locale === "ar" ? "ليس لديك الصلاحية." : "Permission denied.")
    : (e && e.message) || (locale === "ar" ? "خطأ في الخادم." : "Server error.")
  box.appendChild(body)
  return box
}

function renderBetaPlaceholder(text, locale) {
  const box = document.createElement("article")
  box.style.cssText = "padding:var(--maq-space-6);background:var(--maq-neutral-50);border:1px dashed var(--maq-neutral-300);border-radius:var(--maq-radius-md);text-align:center"
  const icon = document.createElement("p"); icon.setAttribute("aria-hidden", "true"); icon.style.cssText = "font-size:var(--maq-text-3xl);margin:0 0 var(--maq-space-3);color:var(--maq-neutral-400)"
  icon.textContent = "🚧"
  box.appendChild(icon)
  const h = document.createElement("p"); h.style.cssText = "margin:0 0 var(--maq-space-2);font-weight:var(--maq-weight-semibold);color:var(--maq-neutral-700)"
  h.textContent = locale === "ar" ? "قريبًا" : "Coming later"
  box.appendChild(h)
  const body = document.createElement("p"); body.style.cssText = "margin:0;font-size:var(--maq-text-sm);color:var(--maq-neutral-600);max-inline-size:480px;margin-inline:auto;line-height:var(--maq-leading-relaxed)"
  body.textContent = text
  box.appendChild(body)
  return box
}

export default { render }
