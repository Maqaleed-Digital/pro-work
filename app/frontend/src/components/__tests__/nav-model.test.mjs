// WC-W4-UI-001 · UI-1.1 nav-model tests (node:test, pure model). Real evidence the two-front
// architecture + surface-access guard hold — independent of the (now-real) CI build.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  FRONTS, FRONT_IDS, FRONT_NAV, INTERNAL_ONLY_ROUTES, EXCLUDED_SURFACES,
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
  assert.ok(aKeys.includes("dashboard") && aKeys.includes("billing") && aKeys.includes("hyperpay-test"))
  for (const internal of INTERNAL_ONLY_ROUTES) assert.ok(bKeys.includes(internal), `B should expose ${internal}`)
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
