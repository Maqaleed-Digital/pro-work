# `src/api/` — Hand-written typed API client wrappers

Per **Sponsor decision B4** (2026-05-11) and **PROPOSAL §2.3 / §3**: this
project does NOT consume an OpenAPI-generated client. Instead, each
backend endpoint touched by the customer-facing UI gets a hand-written
wrapper in this directory, with a one-line comment header citing the
source router file in `app/api/`.

## Conventions

- One file per logical endpoint family (e.g., `dashboard.js`, `cohort.js`,
  `invitations.js`).
- Each wrapper imports `apiGet` / `apiPost` / `apiPatch` / `apiPostPublic`
  from `../api.js` (existing JWT-bearing helpers).
- Each wrapper returns `Promise<data>` (already unwrapped from
  `{ ok, data }` envelope by `handleResp` in `api.js`).
- Each wrapper validates the return shape minimally — defensive
  destructuring with sensible defaults so a partial backend response
  doesn't crash the UI.

## File index (as of Day 4)

| File | Source router | Surfaces consuming |
|---|---|---|
| [dashboard.js](dashboard.js) | [app/api/dashboard_router.js](../../../api/dashboard_router.js) + [compliance_overview](../../../api/compliance_overview_router.js) — see fallback chain | `pages/dashboard.js` |
| [cohort.js](cohort.js) | [app/api/cohort_router.js](../../../api/cohort_router.js) (WC-CB Day 3) | `pages/request_access.js` (already inlined; Day 4 extracts for reuse) |
| [onboarding.js](onboarding.js) | [app/api/employer_onboarding_router.js](../../../api/employer_onboarding_router.js) | `pages/onboarding.js`, `pages/settings.js` |
| [invitations.js](invitations.js) | [app/api/invitation_router.js](../../../api/invitation_router.js) | `pages/settings.js` (users tab) |
| [nitaqat.js](nitaqat.js) | [app/api/nitaqat_router.js](../../../api/nitaqat_router.js) (admin) + `compliance/dashboard` (jwt) | `pages/compliance_nitaqat_detail.js` (deferred to Day 5) |

## Pattern

```js
// /opt/prowork/app/frontend/src/api/foo.js
// Wraps app/api/foo_router.js — POST /api/foo, GET /api/foo/:id
import { apiGet, apiPost } from "../api.js"

export async function listFoo() {
  const data = await apiGet("/api/foo")
  return { items: (data && data.items) || [], count: (data && data.count) || 0 }
}

export async function getFoo(id) {
  return apiGet(`/api/foo/${encodeURIComponent(id)}`)
}

export async function createFoo(body) {
  return apiPost("/api/foo", body)
}
```
