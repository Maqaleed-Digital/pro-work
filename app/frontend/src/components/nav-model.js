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
  A: Object.freeze({ id: "workcaptain", kind: "customer", brand: { name: "WorkCaptain", copyStatus: "PENDING-DL-037-CONFIRMATION" } }),
  // FRONT B — internal: operators / support / governance / audit / oversight. Institutional, governance-first.
  B: Object.freeze({ id: "maqaleed-workforce-console", kind: "internal", brand: { name: "Maqaleed Workforce Console", copyStatus: "confirmed" } }),
})
export const FRONT_IDS = Object.freeze(["A", "B"])

// Operator-only surfaces. FRONT A (customer) MUST NOT route to any of these — direct URL blocked,
// not merely hidden (enforced in router.navigate via canAccessRoute).
export const INTERNAL_ONLY_ROUTES = Object.freeze(["admin", "audit", "governance", "tenants", "evidence", "system"])

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
  A: Object.freeze([
    { key: "dashboard",     label: "Dashboard",          mode: "A" },
    { key: "workforce",     label: "Workforce",          mode: "A" }, // customer workforce mgmt
    { key: "onboarding",    label: "Onboarding",         mode: "D" },
    { key: "compliance",    label: "Compliance",         mode: "D" }, // customer compliance (NOT operator governance)
    { key: "billing",       label: "Billing",            mode: "D" },
    { key: "hyperpay-test", label: "Payments (sandbox)", mode: "D" }, // HyperPay test flow, disclosed-not-live
  ]),
  B: Object.freeze([
    { key: "admin",      label: "Admin",       mode: "D" },
    { key: "audit",      label: "Audit",       mode: "D" },
    { key: "governance", label: "Governance",  mode: "A" },
    { key: "tenants",    label: "Tenants",     mode: "A" },
    { key: "evidence",   label: "Evidence",    mode: "A" },
    { key: "system",     label: "System",      mode: "A" },
    { key: "pods",       label: "Pods",        mode: "A" },
    { key: "assignments",label: "Assignments", mode: "A" },
    { key: "scheduler",  label: "Scheduler",   mode: "A" },
    { key: "analytics",  label: "Analytics",   mode: "A" },
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
