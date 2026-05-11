// Wraps app/api/evidence_pack_router.js for the brief §6 Data export
// surface.
//
// Backend reality:
//   GET  /api/evidence/packs                 — list packs for tenant
//   GET  /api/evidence/packs/:id             — get pack (verify hash;
//                                              409 INTEGRITY_VIOLATION
//                                              if stored hash != computed)
//   POST /api/evidence/packs/:id/export      — export single pack as
//                                              JSON or ZIP (≤60s SLA)
//   POST /api/evidence/bulk-export           — export multiple to ZIP
//   GET  /api/evidence/audit                 — tenant audit trail
//
// Per Sponsor stricter rule today: export uses the QueuedAction
// pattern (src/components/queued_action.js). User triggers; status
// chip surfaces queued → succeeded; failure retries with backoff.

import { apiGet, getToken, getTenant } from "../api.js"

/**
 * List all evidence packs for the authenticated tenant.
 */
export async function listEvidencePacks() {
  try {
    const data = await apiGet("/api/evidence/packs")
    const arr = Array.isArray(data && data.packs) ? data.packs : (Array.isArray(data) ? data : [])
    return { packs: arr.map(normalisePack) }
  } catch (e) {
    if (e && (e.status === 404 || e.code === "NOT_FOUND")) return { packs: [] }
    throw e
  }
}

/**
 * Trigger a single-pack export. Returns a Promise that resolves with
 * the parsed export body (JSON) or triggers a browser download (ZIP).
 *
 * @param {string} packId
 * @param {'json'|'zip'} [format='zip']
 * @returns {Promise<{format: string, filename: string}>}
 */
export async function exportEvidencePack(packId, format = "zip") {
  const tok = getToken()
  const headers = {
    "content-type": "application/json",
    "cache-control": "no-store",
    "X-Tenant-Id": getTenant(),
  }
  if (tok) headers["Authorization"] = "Bearer " + tok

  const resp = await fetch(`/api/evidence/packs/${encodeURIComponent(packId)}/export`, {
    method: "POST",
    headers,
    body: JSON.stringify({ format }),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => "")
    let err
    try { err = JSON.parse(text) } catch { err = { error: { code: "EXPORT_FAILED", message: "Export failed" } } }
    const e = new Error((err.error && err.error.message) || "Export failed")
    e.code = (err.error && err.error.code) || "EXPORT_FAILED"
    e.status = resp.status
    throw e
  }

  if (format === "zip") {
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `evidence-pack-${packId}.zip`
    a.click()
    URL.revokeObjectURL(url)
    return { format: "zip", filename: a.download }
  }

  const json = await resp.json()
  return json && json.data ? json.data : json
}

function normalisePack(p) {
  if (!p || typeof p !== "object") return null
  return {
    id: p.id || p.pack_id || "",
    type: p.type || p.pack_type || "",
    createdAt: p.created_at || p.createdAt || null,
    size: typeof p.size_bytes === "number" ? p.size_bytes : (typeof p.size === "number" ? p.size : null),
    sha256: p.sha256 || p.hash || null,
  }
}
