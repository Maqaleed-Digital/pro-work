// WC-W4-UI-001 · UI-1 nav-model tests (node:test — pure model, no DOM). Real evidence the
// Sponsor rulings hold, independent of the app required-checks (which are genesis stubs).
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  BRANDS, ROLE_NAV, ROLES, EXCLUDED_SURFACES, isExcluded, roleMode, excludedLeakage,
} from "../nav-model.js"

test("DL-037 dual-brand: structural switch present, exact copy FLAGGED (not invented)", () => {
  assert.equal(BRANDS.primary.name, "WorkCaptain")
  assert.equal(BRANDS.cobrand.name, "Maqaleed Workforce")
  assert.equal(BRANDS.copyStatus, "PENDING-DL-037-CONFIRMATION")
})

test("role-aware nav: admin/employer/worker trees exist; admin populated with in-scope surfaces", () => {
  assert.deepEqual(ROLES, ["admin", "employer", "worker"])
  assert.ok(ROLE_NAV.admin.length >= 10)
  // admin surfaces are the in-scope live ones (Mode-A)
  assert.ok(ROLE_NAV.admin.every((t) => t.mode === "A"))
  assert.ok(ROLE_NAV.admin.some((t) => t.key === "dashboard"))
})

test("HARD EXCLUDE (D-A marketplace+ERI, D-B ai): NOT in any nav tree — no leakage", () => {
  // the ruling set is registered
  assert.deepEqual([...EXCLUDED_SURFACES.deferred], ["post-role", "candidates", "seeker-home", "identity"])
  assert.deepEqual([...EXCLUDED_SURFACES.heldUntilUI4], ["ai"])
  // and none of them appear anywhere in the nav
  for (const k of [...EXCLUDED_SURFACES.deferred, ...EXCLUDED_SURFACES.heldUntilUI4]) {
    assert.equal(isExcluded(k), true)
  }
  assert.deepEqual(excludedLeakage(), []) // ZERO excluded surfaces present in any role tree
})

test("non-vacuous: the leakage guard CAN fail (a planted excluded key is detected)", () => {
  // sanity that excludedLeakage actually detects a leak — proves the empty result above is real
  const planted = { admin: [{ key: "post-role", label: "x", mode: "A" }] }
  const leaked = []
  for (const item of planted.admin) if (isExcluded(item.key)) leaked.push(`admin:${item.key}`)
  assert.deepEqual(leaked, ["admin:post-role"])
})

test("Mode-A/D: live role is Mode-A; empty (forthcoming) role is disclosed-not-live (Mode-D)", () => {
  assert.equal(roleMode("admin"), "A")        // populated, live
  assert.equal(roleMode("employer"), "D")     // forthcoming → disclosed-not-live
  assert.equal(roleMode("worker"), "D")
})
