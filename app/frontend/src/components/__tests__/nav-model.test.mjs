// WC-W4-UI-001 · UI-1.1 nav-model tests (node:test, pure model). Real evidence the two-front
// architecture + surface-access guard hold — independent of the (now-real) CI build.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  FRONTS, FRONT_IDS, FRONT_NAV, INTERNAL_ONLY_ROUTES, EXCLUDED_SURFACES, EXECUTING_SURFACES,
  isExcluded, canAccessRoute, frontAInternalLeak, frontMode,
} from "../nav-model.js"

test("two-product model: A=WorkCaptain (customer, copy PENDING), B=Maqaleed Workforce Console (internal)", () => {
  assert.deepEqual(FRONT_IDS, ["A", "B"])
  assert.equal(FRONTS.A.id, "workcaptain")
  assert.equal(FRONTS.A.kind, "customer")
  assert.equal(FRONTS.A.brand.copyStatus, "PENDING-DL-037-CONFIRMATION") // not invented
  assert.equal(FRONTS.B.id, "maqaleed-workforce-console")
  assert.equal(FRONTS.B.kind, "internal")
})

test("front-level default Mode: Customer=D (disclosed-not-live), Internal=A (live)", () => {
  assert.equal(FRONTS.A.defaultMode, "D")
  assert.equal(FRONTS.B.defaultMode, "A")
  assert.equal(frontMode("A"), "D")
  assert.equal(frontMode("B"), "A")
  // customer-front surfaces inherit Mode-D (whole customer product disclosed-not-live)
  assert.ok(FRONT_NAV.A.every((s) => s.mode === "D"))
})

test("per-front nav: Front A is customer surfaces; Front B holds the internal/operator surfaces", () => {
  const aKeys = FRONT_NAV.A.map((i) => i.key)
  const bKeys = FRONT_NAV.B.map((i) => i.key)
  assert.ok(aKeys.includes("fee-transparency") && aKeys.includes("hyperpay-test"))
  // beta is in the operator set and lives on Front B (not A)
  for (const internal of INTERNAL_ONLY_ROUTES) {
    if (internal === "beta") { assert.ok(bKeys.includes("beta")); continue }
    assert.ok(bKeys.includes(internal), `B should expose ${internal}`)
  }
})

test("UI-2: beta_dashboard correctly placed Front B / Mode A + executing-tagged; Front A walled from /admin/beta", () => {
  // reclassified internal: in the guard set, on Front B, NOT on Front A
  assert.ok(INTERNAL_ONLY_ROUTES.includes("beta"))
  const beta = FRONT_NAV.B.find((i) => i.key === "beta")
  assert.ok(beta && beta.mode === "A" && beta.executing === true)
  assert.equal(FRONT_NAV.A.some((i) => i.key === "beta"), false)
  // executing action recorded (Addendum B: executes ⇒ Mode A + review)
  assert.equal(EXECUTING_SURFACES.beta.action, "/admin/beta/ceo-exit-request")
  // routing-level wall: Front A cannot reach /admin/beta; Front B can
  assert.equal(canAccessRoute("A", "beta"), false)
  assert.equal(canAccessRoute("B", "beta"), true)
  // NON-VACUOUS control: a planted /admin/beta link on Front A IS detected as a leak
  assert.deepEqual(frontAInternalLeak([{ key: "beta", label: "x", mode: "A" }]), ["beta"])
})

test("UI-5: trust surfaces (evidence/governance) classify Front B / Mode D display-only — NO executors", () => {
  const ev = FRONT_NAV.B.find((i) => i.key === "evidence")
  const gov = FRONT_NAV.B.find((i) => i.key === "governance")
  assert.ok(ev && ev.mode === "D" && !ev.executing, "evidence: Front B, Mode D, display-only")
  assert.ok(gov && gov.mode === "D" && !gov.executing, "governance: Front B, Mode D, display-only")
  // matrix finding: NO trust surface (evidence/governance) executes — they are display-only.
  // (Executors on Front B are beta [UI-2] and payout-matrix [UI-6 PSP routing], not trust surfaces.)
  assert.equal(["evidence", "governance"].some((k) => FRONT_NAV.B.find((i) => i.key === k)?.executing), false)
  // not on Front A
  assert.equal(FRONT_NAV.A.some((i) => i.key === "evidence" || i.key === "governance"), false)
})

test("UI-5: evidence-pack export is internal (Front B, Mode D read+export) and Front A is walled from it", () => {
  assert.ok(INTERNAL_ONLY_ROUTES.includes("evidence-export"))
  const exp = FRONT_NAV.B.find((i) => i.key === "evidence-export")
  assert.ok(exp && exp.mode === "D" && !exp.executing, "export: Front B, Mode D, no server action")
  assert.equal(FRONT_NAV.A.some((i) => i.key === "evidence-export"), false)
  // routing-level wall
  assert.equal(canAccessRoute("A", "evidence-export"), false)
  assert.equal(canAccessRoute("B", "evidence-export"), true)
  // NON-VACUOUS control: a planted evidence-export link on Front A IS detected as a leak
  assert.deepEqual(frontAInternalLeak([{ key: "evidence-export", label: "x", mode: "D" }]), ["evidence-export"])
})

test("UI-6: fee_transparency is GENUINELY customer (Front A, Mode D display) — first customer surface, held", () => {
  const fee = FRONT_NAV.A.find((i) => i.key === "fee-transparency")
  assert.ok(fee && fee.mode === "D" && fee.held === true && !fee.executing, "fee-transparency: Front A, Mode D, held, display")
  assert.equal(canAccessRoute("A", "fee-transparency"), true) // customer surface — reachable on Front A
  assert.equal(FRONT_NAV.B.some((i) => i.key === "fee-transparency"), false)
})

test("UI-6: esb_calculator EXECUTES (Store-as-Evidence) → tagged Mode A executing", () => {
  assert.ok(EXECUTING_SURFACES["esb-calculator"], "esb-calculator recorded as executing")
  assert.match(EXECUTING_SURFACES["esb-calculator"].action, /esb\/calculate|Store-as-Evidence/)
})

test("UI-6: payout-matrix (PSP routing config) is INTERNAL (Front B) — Front A walled; non-vacuous control", () => {
  assert.ok(INTERNAL_ONLY_ROUTES.includes("payout-matrix"))
  assert.ok(FRONT_NAV.B.some((i) => i.key === "payout-matrix"))
  assert.equal(FRONT_NAV.A.some((i) => i.key === "payout-matrix"), false)
  assert.equal(canAccessRoute("A", "payout-matrix"), false) // customer walled from PSP routing config
  assert.equal(canAccessRoute("B", "payout-matrix"), true)
  // NON-VACUOUS control: a planted internal-finance route on Front A IS detected as a leak
  assert.deepEqual(frontAInternalLeak([{ key: "payout-matrix", label: "x", mode: "A" }]), ["payout-matrix"])
})

test("UI-2: Front A has NO wired customer dashboard — all customer surfaces held disclosed-not-live", () => {
  // no real customer-dashboard route on Front A; every Front-A surface is held (no overclaim)
  assert.ok(FRONT_NAV.A.every((i) => i.held === true))
  assert.equal(FRONT_NAV.A.some((i) => i.key === "dashboard"), false) // ops dashboard not on customer front
  // employer/worker contexts present but held (disclosed-not-live)
  assert.ok(FRONT_NAV.A.some((i) => i.key === "employer-context" && i.held))
  assert.ok(FRONT_NAV.A.some((i) => i.key === "worker-context" && i.held))
})

test("SURFACE-ACCESS GUARD: Front A cannot reach ANY internal route; Front B can reach all", () => {
  for (const r of INTERNAL_ONLY_ROUTES) {
    assert.equal(canAccessRoute("A", r), false, `Front A must be walled from ${r}`)
    assert.equal(canAccessRoute("B", r), true, `Front B may reach ${r}`)
  }
  // customer-front surfaces remain reachable on A
  assert.equal(canAccessRoute("A", "dashboard"), true)
  assert.equal(canAccessRoute("A", "billing"), true)
})

test("boundary guard is NON-VACUOUS: no leak in Front A nav, AND a planted internal route IS detected", () => {
  // real state: zero internal/excluded routes present in Front A's nav
  assert.deepEqual(frontAInternalLeak(FRONT_NAV.A), [])
  // control: if the guard regressed and 'governance' rode into Front A, the detector fires
  const planted = [{ key: "dashboard", label: "x", mode: "A" }, { key: "governance", label: "x", mode: "A" }]
  assert.deepEqual(frontAInternalLeak(planted), ["governance"])
})

test("carry-forward exclusions (D-A deferred + D-B ai): reachable on NEITHER front, in NO front nav", () => {
  assert.deepEqual([...EXCLUDED_SURFACES.deferred], ["post-role", "candidates", "seeker-home", "identity"])
  assert.deepEqual([...EXCLUDED_SURFACES.heldUntilUI4], ["ai"])
  for (const k of [...EXCLUDED_SURFACES.deferred, ...EXCLUDED_SURFACES.heldUntilUI4]) {
    assert.equal(isExcluded(k), true)
    assert.equal(canAccessRoute("A", k), false)
    assert.equal(canAccessRoute("B", k), false) // excluded everywhere, even internal front
  }
  const all = [...FRONT_NAV.A, ...FRONT_NAV.B].map((i) => i.key)
  for (const k of [...EXCLUDED_SURFACES.deferred, ...EXCLUDED_SURFACES.heldUntilUI4]) {
    assert.equal(all.includes(k), false, `${k} must not appear in any front nav`)
  }
})
