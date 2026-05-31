# VERITAS Integration — Scope-Block Memo

**Document:** VER-WC-SCOPE-001 V1.0
**Date:** 2026-05-31
**Authority basis:** `WORKCAPTAIN_INTEGRATION_BRIEF.md` Sponsor Ruling (31 May 2026).
**Status:** Build-session record. Returns to Programme Office for Decision Log filing.

This memo records the events the WorkCaptain→VERITAS integration PR does **not** wire, classified by reason. Per Sponsor Ruling, partial 4-of-6 (or 3-of-6 if no event-6 guards qualify) is **intentional and traceable**, not a latent defect. The Programme Office files a Decision Log note recording 2/5/6 as deferred-by-capability-gap on return of this memo.

## What this PR delivers

- Event-bus forwarder at `app/modules/event_bus/veritas_forwarder.js` (Sponsor-named path).
- Vendored exact schema at `app/modules/event_bus/veritas/schema.json` (single contract source; switch to a published VERITAS package when available).
- Whitelisted forwarding for events **1, 3, 4** — internal types `ONBOARDING_STARTED`, `CANDIDATE_MATCHED`, `CANDIDATE_SHORTLISTED`.
- Event **6** wired as fire-and-forget pre-throw emit at the qualifying guard sites in `contract_state_machine.js` (see classification below).
- Tests: forwarder behaviour + eight-attribute schema validation + Mode-D + whitelist exactness + governance-exception fire-and-forget behaviour preservation.
- CI gate at `.github/workflows/veritas_forwarder_gate.yml` asserting whitelist exactness and running the test suite.

## Deferred — classified

### Event 2 — `WORKCAPTAIN_ONBOARDING_COMPLETED`
**Classification:** Product gap.
**Evidence:** Discovery found no completion handler in `app/modules/onboarding/`. The probation `CONFIRM` transition (`probation_service.js`) is published as `PROBATION_DECISION_RECORDED` but does not close the onboarding case. There is no `ONBOARDING_COMPLETED` event_type registered in `schema_registry.js`.
**Re-wire trigger:** when onboarding-completion is defined as a product behaviour (handler + state-machine terminal transition + internal event_type), add the internal type to the WHITELIST (require a new Sponsor Ruling per the exact-set rule) and the forwarder picks it up automatically.

### Event 5 — `WORKCAPTAIN_CROSS_PLATFORM_SIGNAL_EMITTED`
**Classification:** Capability absent.
**Evidence:** The only outbound adapters present are stubs: `app/modules/payments/tap_adapter.js`, `payments/hyperpay_adapter.js`, `fabric/trust_fabric_adapter.js`. None publish to credito / societa / s2ppro / myveticare / aispm. There is no cross-platform publisher in the codebase.
**Re-wire trigger:** when the first real cross-platform integration lands (a publisher targeting one of the portfolio platforms), introduce an internal event_type for that outbound, add it to the WHITELIST (new Sponsor Ruling required), and the forwarder routes it.

### Event 6 — `WORKCAPTAIN_GOVERNANCE_EXCEPTION`
**Classification:** Scoping (per Sponsor Ruling scoping line).
**Sponsor scoping line:** *"emit only for Mode, authority, policy, classification, or execution-boundary guard violations; do NOT emit for ordinary validation, missing fields, user-input errors, or expected business-rule rejection."*

**Guard-by-guard classification at `contract_state_machine.js:133-203` and the two transition checks at lines 299-312:**

| Site | Guard / Check | Classification | Emit? |
|---|---|---|---|
| L146-152 | `human_actor` (auto-transition attempted on HUMAN-required transition) | **execution-boundary** — autonomous execution attempted where authority requires human | **YES** |
| L299-303 | Terminal-state check (transition attempted from a terminal state) | **policy** — the state graph is the policy | **YES** |
| L307-312 | Invalid-transition check (transition not allowed by state graph) | **policy** — state graph violation | **YES** |
| L136-145 | `qiwa_completeness` (Qiwa-required fields missing) | ordinary validation / missing fields | NO |
| L154-161 | `both_party_signatures` (signatures missing) | **borderline** — could be authority; conservatively classed as expected business-rule rejection (signature presence check) | NO (deferred — see note) |
| L162-169 | `activation_date` (input missing) | ordinary validation | NO |
| L170-177 | `amendment_reason` (input missing) | ordinary validation | NO |
| L178-185 | `amended_fields` (input missing/malformed) | ordinary validation | NO |
| L186-193 | `termination_code` (input missing) | ordinary validation | NO |
| L194-201 | `notice_details` (input missing/malformed) | ordinary validation | NO |

**Note on `both_party_signatures`:** the guard could be classified as **authority** (who is authorised to bind the contract). It is deferred from emit pending Sponsor confirmation because: (a) the brief asks not to force an emit when classification is ambiguous, and (b) the check is structurally identical to other "required input present" guards. If Sponsor classifies it as authority, the emit is one additional `veritasGuards.emitGovernanceException(...)` call at line 156 with `kind: 'authority', guard: 'both_party_signatures'`. Recommend a 1-line Sponsor amendment if that classification is intended.

## Whitelist mutation control

Any future addition or removal to the forwarder WHITELIST requires:
1. A Sponsor Ruling amendment specifying the new approved set.
2. Updating `APPROVED` in `scripts/veritas_whitelist_check.js` to match.
3. Updating the `WHITELIST is exactly the Sponsor-approved set` test in `tests/event_bus.veritas_forwarder.test.js`.
4. CI gate `veritas-forwarder-gate` will block the PR until those three are in lockstep.

This is by design — silent additions are a leak risk per the Ruling.

## Open follow-ups (out of scope for this PR)

1. **Real Pub/Sub transport.** Current default is `noopTransport()`; `loggingTransport()` writes to stderr for debugging. A real Pub/Sub transport ships when VERITAS substrate is reachable from prowork's CI/runtime — needs `google-cloud-pubsub`, WIF service-account, and the topic/project env vars (`VERITAS_PROJECT_ID`, `VERITAS_TOPIC`).
2. **Composition-root wiring.** This PR ships the wrapper factory `createVeritasForwardingPublisher`; current `createEventPublisher` call sites (e.g. `app/api/pdpl_router.js:73`) are unchanged. Wiring WorkCaptain's onboarding / matching engines to use the wrapped publisher is a one-line change per composition site, deferred to keep this PR behaviour-preserving by default.
3. **Switch to published VERITAS package.** Remove the vendored `app/modules/event_bus/veritas/schema.json` once a published VERITAS package is available; update `contract.js` to consume the package's `SCHEMA` and `buildVeritasEvent` export.
