// WC-W4-UI-001 · UI-1.1 — Two-Front Product Architecture (DL-037 refinement). Pure model
// (no DOM), so the surface-access guard is unit-testable. nav.js + router.js render/enforce it.
//
// ONE backend (id `prowork`, unchanged). SHARED: auth / tenancy / data-model / APIs / audit /
// business-logic. SEPARATED (front-level): branding / nav / layouts / journeys / surface-exposure.
// NO tenancy split, NO data-model split.
//
// FLAGS (surfaced, not resolved): Front A (customer) exact brand copy = PENDING-DL-037-CONFIRMATION
// (structural only, not invented). The 3 stacks are NOT consolidated (separate Sponsor decision).

export const FRONTS = Object.freeze({
  // FRONT A — customer: employers / workers / commercial. Simple, conversion-oriented SaaS.
  // defaultMode D: the customer product is disclosed-not-live by default (not yet productionised).
  A: Object.freeze({ id: "workcaptain", kind: "customer", defaultMode: "D", brand: { name: "WorkCaptain", copyStatus: "PENDING-DL-037-CONFIRMATION" } }),
  // FRONT B — internal: operators / support / governance / audit / oversight. Institutional, governance-first.
  // defaultMode A: the internal console is operational/live.
  B: Object.freeze({ id: "maqaleed-workforce-console", kind: "internal", defaultMode: "A", brand: { name: "Maqaleed Workforce Console", copyStatus: "confirmed" } }),
})
export const FRONT_IDS = Object.freeze(["A", "B"])

/** Front-level default Mode (Customer → D / Internal → A). */
export function frontMode(front) { return (FRONTS[front] && FRONTS[front].defaultMode) || "D" }

// Operator-only surfaces. FRONT A (customer) MUST NOT route to any of these — direct URL blocked,
// not merely hidden (enforced in router.navigate via canAccessRoute).
// UI-2: `beta` (/admin/beta GTM scorecard — internal, POSTs /admin/beta/ceo-exit-request) added here
// after the UI-0 audit misclassified it as a customer surface (corrected per Sponsor ruling).
export const INTERNAL_ONLY_ROUTES = Object.freeze(["admin", "audit", "governance", "tenants", "evidence", "system", "beta"])

// Surfaces carrying an EXECUTING action (Addendum B: executes ⇒ Mode A + review, not passive display).
export const EXECUTING_SURFACES = Object.freeze({
  beta: Object.freeze({ action: "/admin/beta/ceo-exit-request", method: "POST" }),
})

// Carry-forward exclusions (Sponsor D-A deferred + D-B held) — reachable on NEITHER front.
export const EXCLUDED_SURFACES = Object.freeze({
  deferred: Object.freeze(["post-role", "candidates", "seeker-home", "identity"]),
  heldUntilUI4: Object.freeze(["ai"]),
})
export function isExcluded(key) {
  return EXCLUDED_SURFACES.deferred.includes(key) || EXCLUDED_SURFACES.heldUntilUI4.includes(key)
}

// Per-front nav — IN-SCOPE surfaces only. mode A = live on main; mode D = forthcoming, disclosed-not-live.
export const FRONT_NAV = Object.freeze({
  // FRONT A — customer. Mode D throughout. UI-2: NO real customer dashboard exists on S45 to
  // integrate, so all customer surfaces (incl. dashboard + employer/worker contexts) are HELD
  // disclosed-not-live (held:true ⇒ rendered as a non-navigable disclosed-not-live placeholder).
  A: Object.freeze([
    { key: "customer-dashboard", label: "Dashboard",          mode: "D", held: true },
    { key: "employer-context",   label: "Employer",           mode: "D", held: true },
    { key: "worker-context",     label: "Worker",             mode: "D", held: true },
    { key: "onboarding",         label: "Onboarding",         mode: "D", held: true },
    { key: "compliance",         label: "Compliance",         mode: "D", held: true },
    { key: "billing",            label: "Billing",            mode: "D", held: true },
    { key: "hyperpay-test",      label: "Payments (sandbox)", mode: "D", held: true },
  ]),
  // FRONT B — Maqaleed Workforce Console (internal). Live ops/governance surfaces = Mode A.
  // beta (Beta/GTM scorecard) lives here with an executing action (see EXECUTING_SURFACES).
  B: Object.freeze([
    { key: "dashboard",  label: "Ops Dashboard", mode: "A" },                 // ops dashboard.js (unchanged)
    { key: "beta",       label: "Beta / GTM",    mode: "A", executing: true },// /admin/beta — internal, executing
    { key: "governance", label: "Governance",    mode: "A" },
    { key: "tenants",    label: "Tenants",       mode: "A" },
    { key: "evidence",   label: "Evidence",      mode: "A" },
    { key: "system",     label: "System",        mode: "A" },
    { key: "pods",       label: "Pods",          mode: "A" },
    { key: "assignments",label: "Assignments",   mode: "A" },
    { key: "scheduler",  label: "Scheduler",     mode: "A" },
    { key: "analytics",  label: "Analytics",     mode: "A" },
    { key: "admin",      label: "Admin",         mode: "D", held: true },
    { key: "audit",      label: "Audit",         mode: "D", held: true },
  ]),
})

/** SURFACE-ACCESS GUARD (routing-level). Can `front` reach `routeKey`? */
export function canAccessRoute(front, routeKey) {
  if (isExcluded(routeKey)) return false                                  // deferred/held: never on any front
  if (front === "A" && INTERNAL_ONLY_ROUTES.includes(routeKey)) return false // customer cannot reach internal
  return true
}

/** Leak detector — any internal/excluded route present in a Front-A nav list (should be []). */
export function frontAInternalLeak(navA) {
  const list = navA || FRONT_NAV.A
  return list.map((i) => i.key).filter((k) => INTERNAL_ONLY_ROUTES.includes(k) || isExcluded(k))
}
