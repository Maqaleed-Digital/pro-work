// WC-CB Day 3 (D-3, 2026-05-13): Self-serve registration is DISABLED.
//
// Authority: WC Controlled-Launch Memo V1.1 + brief §2 — "Submission stored
// for sponsor review and manual invitation issuance (no auto-approval)."
// PROPOSAL §11.A2 stricter-interpretation rule: kill self-serve account
// creation during the controlled-beta window.
//
// The /#register hash route now redirects to /#request-access. Anyone
// arriving here via a bookmarked or shared link is routed to the cohort
// intake form, not to instant account creation.
//
// The historic self-serve flow (apiPostPublic /api/auth/register then
// setToken + redirect to onboarding) violated brief §2 and §11.A4
// (no phantom features). Backend POST /api/auth/register is preserved
// for invitation-redemption flows (/accept-invite) and admin use.
//
// Post-D15+41 disposition: if controlled-beta gating is lifted by
// Sponsor decision, restore the self-serve form OR fold its content
// into accept_invite.js as the only post-invitation account
// completion path.

function render(el) {
  // Immediate redirect — no flash of disabled UI.
  if (typeof window !== "undefined") {
    window.location.hash = "request-access"
  }
  // Render a minimal note in case the redirect is observable (Safari
  // sometimes paints the previous route's contents briefly).
  el.innerHTML = ""
  const note = document.createElement("p")
  note.setAttribute("role", "status")
  note.style.cssText = [
    "padding: var(--maq-space-8)",
    "text-align: center",
    "color: var(--maq-neutral-600)",
    "font-family: var(--maq-font-arabic), var(--maq-font-latin)",
  ].join(";")
  note.textContent = "Redirecting to controlled-beta access request…"
  el.appendChild(note)
}

export default { render }
