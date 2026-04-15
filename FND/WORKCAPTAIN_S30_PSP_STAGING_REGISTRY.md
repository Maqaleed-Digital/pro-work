# WORKCAPTAIN — S30 PSP STAGING REGISTRY

Version: 1.0
Status: LOCKED

---

## 1. PSP PROVIDERS IN S30

| Provider | Primary Role | Initial State |
|---|---|---|
| Stripe | Global commercial path / marketplace baseline | STAGED |
| Tap | GCC / MENA commercial path | STAGED |
| HyperPay | KSA local payment path | STAGED |
| PayTabs | Optional MENA alternative | PLANNED |
| Payoneer | Optional withdrawal path | PLANNED |
| Wise | Optional withdrawal path | PLANNED |

---

## 2. PSP STATE VALUES

- PLANNED
- STAGED
- READY_FOR_INTEGRATION
- LIVE

---

## 3. HARD RULES

1. No PSP may be shown as LIVE without implemented proof.
2. PSP state must be visible in product.
3. Fee path must be disclosed.
4. Escrow / payout readiness must be visible.
5. Commercial claims must remain audit-safe.

---

## 4. REQUIRED PSP ATTRIBUTES

- provider_name
- state
- role
- region_scope
- payout_support
- escrow_support
- fee_visibility
- notes
- next_action
