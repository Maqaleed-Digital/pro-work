// WC-W4-UI-001 · UI-1 nav data-model (pure — no DOM/browser imports, so it is unit-testable
// in node). nav.js renders from this. Carries: dual-brand (DL-037) structural switch, the
// role-aware in-scope trees, Mode-A/D tagging, and the HARD-EXCLUDE registry.
//
// FLAGS (per dispatch — surfaced, not silently resolved):
//  - DL-037 brand COPY is NOT in-repo. We render the structural dual-brand switch and mark the
//    wording PENDING-DL-037-CONFIRMATION. Brand text is NOT invented.
//  - The 3 stacks (app/frontend Vite SPA · admin-console · trust-explorer) are NOT consolidated
//    here — that is a separate Sponsor architecture decision. UI-1 touches app/frontend only.

// Dual-brand (DL-037 / DL-088). Structural switch only; exact copy pending confirmation.
export const BRANDS = Object.freeze({
  primary: { name: "WorkCaptain", tagline: "Workforce OS" },
  cobrand: { name: "Maqaleed Workforce", tagline: null },
  copyStatus: "PENDING-DL-037-CONFIRMATION", // exact brand copy not in-repo — flagged, not invented
});

// HARD EXCLUDE — Sponsor rulings. These surfaces are NOT in any nav tree and NOT wired.
export const EXCLUDED_SURFACES = Object.freeze({
  // D-A: marketplace + ERI, deferred out of scope (off the demo path).
  deferred: Object.freeze(["post-role", "candidates", "seeker-home", "identity"]),
  // D-B: ai held until it ships Mode-D-fenced + fail-closed-visible (UI-4).
  heldUntilUI4: Object.freeze(["ai"]),
});

export function isExcluded(key) {
  return EXCLUDED_SURFACES.deferred.includes(key) || EXCLUDED_SURFACES.heldUntilUI4.includes(key);
}

// Role-aware nav — IN-SCOPE surfaces only. admin tree = the surfaces that exist + are live on
// main (Mode-A). employer/worker are first-class role contexts in the shell; their in-scope
// surfaces arrive in later UI slices (Mode-D / disclosed-not-live) — marketplace stays excluded.
export const ROLE_NAV = Object.freeze({
  admin: Object.freeze([
    { key: "dashboard",   label: "Dashboard",   mode: "A" },
    { key: "workers",     label: "Workers",     mode: "A" },
    { key: "pods",        label: "Pods",        mode: "A" },
    { key: "assignments", label: "Assignments", mode: "A" },
    { key: "evidence",    label: "Evidence",    mode: "A" },
    { key: "scheduler",   label: "Scheduler",   mode: "A" },
    { key: "governance",  label: "Governance",  mode: "A" },
    { key: "tenants",     label: "Tenants",     mode: "A" },
    { key: "analytics",   label: "Analytics",   mode: "A" },
    { key: "system",      label: "System",      mode: "A" },
  ]),
  // disclosed-not-live: role context present, in-scope surfaces forthcoming in later UI slices.
  employer: Object.freeze([]),
  worker:   Object.freeze([]),
});

export const ROLES = Object.freeze(["admin", "employer", "worker"]);

/** A role with no live surfaces yet is disclosed-not-live (fail-closed-visible). */
export function roleMode(role) {
  const tree = ROLE_NAV[role] || [];
  return tree.length > 0 ? "A" : "D";
}

/** Guard: NO excluded surface may appear in ANY role tree. Returns the offending keys (empty = clean). */
export function excludedLeakage() {
  const leaked = [];
  for (const role of ROLES) {
    for (const item of ROLE_NAV[role] || []) {
      if (isExcluded(item.key)) leaked.push(`${role}:${item.key}`);
    }
  }
  return leaked;
}
