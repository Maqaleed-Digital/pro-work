// WC-W4-UI-001 · UI-9 — Acceptance harness. NOT a new surface: an integration proof that the
// WHOLE wave's invariants (UI-1/2/5/6/7) hold TOGETHER on main, and that the customer + operator
// demo journeys are model-consistent and demonstrable. Pure model (no DOM) so it runs in CI; the
// pages' actual render is covered by `vite build`. Every invariant carries a NON-VACUOUS control.
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  FRONTS, FRONT_NAV, INTERNAL_ONLY_ROUTES, EXCLUDED_SURFACES, EXECUTING_SURFACES,
  isExcluded, canAccessRoute, frontAInternalLeak, frontMode,
} from "../nav-model.js"

// ── demo journeys ──────────────────────────────────────────────────────────────
// Customer journey (Front A): the demonstrable path. fee-transparency is the live customer
// surface (Mode D display, held disclosed-not-live); hyperpay-sandbox executes in sandbox only.
const CUSTOMER_JOURNEY = [
  { key: "onboarding",       mode: "D", state: "held" },
  { key: "compliance",       mode: "D", state: "held" },
  { key: "fee-transparency", mode: "D", state: "held" },
  { key: "hyperpay-sandbox", mode: "A", state: "sandbox", executing: true },
]
// Operator journey (Front B): the internal console reaching its operator surfaces.
const OPERATOR_JOURNEY = ["dashboard", "admin", "audit", "governance", "tenants", "evidence", "system", "beta", "evidence-export"]
const HARD_EXCLUDE = ["post-role", "candidates", "seeker-home", "identity"]

const findA = (k) => FRONT_NAV.A.find((i) => i.key === k)
// A "live fund movement / live customer execution" risk: an executing Front-A surface that is
// NEITHER held NOR sandbox-gated. The whole wave must have ZERO of these.
const liveExecRisk = (e) => !!e.executing && !e.held && !e.sandbox

test("ACCEPTANCE · customer journey (Front A) is demonstrable end-to-end with correct modes/states", () => {
  for (const step of CUSTOMER_JOURNEY) {
    const entry = findA(step.key)
    assert.ok(entry, `customer-journey surface ${step.key} present on Front A`)
    assert.equal(entry.mode, step.mode, `${step.key} mode`)
    if (step.state === "held")    assert.equal(entry.held, true, `${step.key} held disclosed-not-live`)
    if (step.state === "sandbox") assert.equal(entry.sandbox, true, `${step.key} sandbox disclosed-not-live`)
    if (step.executing)           assert.equal(entry.executing, true, `${step.key} executing-tagged`)
    assert.equal(canAccessRoute("A", step.key), true, `${step.key} reachable on the customer front`)
    assert.equal(isExcluded(step.key), false)
  }
  // CONTROL: a journey step that doesn't exist on Front A is NOT silently passed.
  assert.equal(findA("nonexistent-surface"), undefined)
})

test("ACCEPTANCE · operator journey (Front B, Mode A console) reaches all operator surfaces", () => {
  assert.equal(frontMode("B"), "A") // internal console is live
  for (const key of OPERATOR_JOURNEY) {
    assert.ok(FRONT_NAV.B.some((i) => i.key === key), `operator surface ${key} on Front B`)
    assert.equal(canAccessRoute("B", key), true, `${key} reachable on the operator front`)
  }
  // CONTROL: the operator front does NOT expose a hard-excluded surface.
  assert.equal(FRONT_NAV.B.some((i) => HARD_EXCLUDE.includes(i.key)), false)
})

test("ACCEPTANCE · FULL surface-access wall — Front A reaches NONE of the internal routes (+ control)", () => {
  for (const r of INTERNAL_ONLY_ROUTES) {
    assert.equal(canAccessRoute("A", r), false, `Front A must be walled from ${r}`)
    assert.equal(canAccessRoute("B", r), true,  `Front B may reach ${r}`)
  }
  // the real Front-A nav has zero internal leaks
  assert.deepEqual(frontAInternalLeak(FRONT_NAV.A), [])
  // NON-VACUOUS control: plant EACH internal route on a Front-A nav list — every one is detected.
  for (const r of INTERNAL_ONLY_ROUTES) {
    assert.deepEqual(frontAInternalLeak([{ key: r, label: "x", mode: "A" }]), [r], `${r} leak detected`)
  }
})

test("ACCEPTANCE · executing surfaces (esb-calculator, hyperpay-sandbox) are Mode A + gated, no live funds (+ control)", () => {
  // esb-calculator: executes, held (review-gated, no live store)
  const esb = EXECUTING_SURFACES["esb-calculator"]
  assert.ok(esb && esb.held === true, "esb-calculator executing + held")
  // hyperpay-sandbox: executes, sandbox-gated, NO live fund movement, G5-held
  const hp = EXECUTING_SURFACES["hyperpay-sandbox"]
  assert.ok(hp && hp.sandbox === true && hp.liveFundMovement === false && hp.liveGate === "G5" && hp.noProductionPath === true)
  const hpNav = findA("hyperpay-sandbox")
  assert.ok(hpNav.mode === "A" && hpNav.executing === true && hpNav.sandbox === true)
  // INVARIANT: ZERO live customer executors anywhere on Front A
  assert.equal(FRONT_NAV.A.some(liveExecRisk), false, "no live customer executor on Front A")
  // NON-VACUOUS control: a planted live-executing surface (executing, NOT held, NOT sandbox) IS flagged
  assert.equal(liveExecRisk({ key: "rogue-charge", executing: true }), true)
  assert.equal(liveExecRisk({ key: "hyperpay-sandbox", executing: true, sandbox: true }), false)
})

test("ACCEPTANCE · HARD-EXCLUDE absent on both fronts; `ai` not exposed (+ control)", () => {
  const allKeys = [...FRONT_NAV.A, ...FRONT_NAV.B].map((i) => i.key)
  for (const k of [...HARD_EXCLUDE, "ai"]) {
    assert.equal(isExcluded(k), true, `${k} excluded`)
    assert.equal(allKeys.includes(k), false, `${k} not in any front nav`)
    assert.equal(canAccessRoute("A", k), false)
    assert.equal(canAccessRoute("B", k), false)
  }
  // NON-VACUOUS control: the exclusion set is NOT vacuously matching everything — an in-scope
  // surface is NOT excluded and IS reachable.
  assert.equal(isExcluded("fee-transparency"), false)
  assert.equal(canAccessRoute("A", "fee-transparency"), true)
})

test("ACCEPTANCE · DL-037 customer copy still PENDING (structural, not invented) (+ control)", () => {
  assert.equal(FRONTS.A.brand.copyStatus, "PENDING-DL-037-CONFIRMATION")
  // NON-VACUOUS control: the assertion distinguishes states — Front A is NOT 'confirmed',
  // and Front B (internal, real name) IS confirmed.
  assert.notEqual(FRONTS.A.brand.copyStatus, "confirmed")
  assert.equal(FRONTS.B.brand.copyStatus, "confirmed")
})
