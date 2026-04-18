// S40-G6: Invite team member page
import { apiPost, apiGet } from "../api.js"
import { t } from "../locale.js"

const ROLES = [
  { value: "ADMIN",            label: "Admin" },
  { value: "HIRING_MANAGER",   label: "Hiring Manager" },
  { value: "FINANCE_APPROVER", label: "Finance Approver" },
  { value: "VIEWER",           label: "Viewer" },
]

function render(el) {
  el.innerHTML = ""

  const wrap = document.createElement("div")
  wrap.className = "invite-page"

  // ── Invite form ───────────────────────────────────────────────────────
  const formSection = document.createElement("section")
  formSection.className = "invite-form-section"

  const title = document.createElement("h2")
  title.textContent = t("invite.title")
  formSection.appendChild(title)

  const form = document.createElement("form")
  form.addEventListener("submit", e => e.preventDefault())

  const emailGroup = document.createElement("div")
  emailGroup.className = "field-group"
  const emailLabel = document.createElement("label")
  emailLabel.htmlFor = "invite-email"
  emailLabel.textContent = t("invite.email")
  const emailInput = document.createElement("input")
  emailInput.type = "email"
  emailInput.id = "invite-email"
  emailInput.placeholder = t("invite.emailPlaceholder")
  emailInput.required = true
  emailGroup.appendChild(emailLabel)
  emailGroup.appendChild(emailInput)
  form.appendChild(emailGroup)

  const roleGroup = document.createElement("div")
  roleGroup.className = "field-group"
  const roleLabel = document.createElement("label")
  roleLabel.htmlFor = "invite-role"
  roleLabel.textContent = t("invite.role")
  const roleSelect = document.createElement("select")
  roleSelect.id = "invite-role"
  ROLES.forEach(r => {
    const opt = document.createElement("option")
    opt.value = r.value
    opt.textContent = r.label
    roleSelect.appendChild(opt)
  })
  roleGroup.appendChild(roleLabel)
  roleGroup.appendChild(roleSelect)
  form.appendChild(roleGroup)

  const errEl = document.createElement("div")
  errEl.className = "onboarding-err"
  errEl.setAttribute("role", "alert")
  form.appendChild(errEl)

  const linkEl = document.createElement("div")
  linkEl.className = "invite-link-box"

  const btn = document.createElement("button")
  btn.type = "submit"
  btn.className = "btn btn-primary"
  btn.textContent = t("invite.send")

  btn.addEventListener("click", async () => {
    errEl.textContent = ""
    linkEl.innerHTML = ""
    const email = (emailInput.value || "").trim()
    const role  = roleSelect.value

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errEl.textContent = t("invite.err.emailInvalid")
      return
    }

    btn.disabled = true
    btn.textContent = t("invite.sending")

    try {
      const data = await apiPost("/api/invitations", { email, role })
      linkEl.innerHTML = ""
      const linkTitle = document.createElement("strong")
      linkTitle.textContent = t("invite.linkLabel")
      linkEl.appendChild(linkTitle)
      const linkText = document.createElement("input")
      linkText.type = "text"
      linkText.readOnly = true
      linkText.value = data.inviteLink
      linkText.className = "invite-link-input"
      linkText.addEventListener("click", () => { linkText.select() })
      linkEl.appendChild(linkText)
      emailInput.value = ""
      loadInvitations()
    } catch (e) {
      errEl.textContent = e.message || t("invite.err.failed")
    }
    btn.disabled = false
    btn.textContent = t("invite.send")
  })

  form.appendChild(btn)
  form.appendChild(linkEl)
  formSection.appendChild(form)
  wrap.appendChild(formSection)

  // ── Pending invitations list ──────────────────────────────────────────
  const listSection = document.createElement("section")
  listSection.className = "invite-list-section"

  const listTitle = document.createElement("h3")
  listTitle.textContent = t("invite.pendingTitle")
  listSection.appendChild(listTitle)

  const listEl = document.createElement("div")
  listEl.id = "invite-list"
  listSection.appendChild(listEl)
  wrap.appendChild(listSection)

  el.appendChild(wrap)

  async function loadInvitations() {
    try {
      const data = await apiGet("/api/invitations")
      const invitations = data.invitations || []
      listEl.innerHTML = ""
      if (invitations.length === 0) {
        listEl.textContent = t("invite.noInvitations")
        return
      }
      invitations.forEach(inv => {
        const row = document.createElement("div")
        row.className = "invite-row invite-status-" + inv.status.toLowerCase()

        const info = document.createElement("span")
        info.textContent = `${inv.email} — ${inv.role} — ${inv.status}`
        row.appendChild(info)

        if (inv.status === "PENDING") {
          const revokeBtn = document.createElement("button")
          revokeBtn.className = "btn btn-danger-sm"
          revokeBtn.textContent = t("invite.revoke")
          revokeBtn.addEventListener("click", async () => {
            try {
              await fetch(`/api/invitations/${inv.id}`, {
                method: "DELETE",
                headers: { "Authorization": "Bearer " + (localStorage.getItem("pw_token") || "") }
              })
              loadInvitations()
            } catch {}
          })
          row.appendChild(revokeBtn)
        }

        listEl.appendChild(row)
      })
    } catch {
      listEl.textContent = t("invite.err.loadFailed")
    }
  }

  loadInvitations()
}

export default { render }
