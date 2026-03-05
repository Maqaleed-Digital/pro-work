export function getToken() {
  try { return localStorage.getItem("pw_token") || "" } catch { return "" }
}

export function setToken(t) {
  const v = String(t || "").trim()
  try {
    if (v) localStorage.setItem("pw_token", v)
    else localStorage.removeItem("pw_token")
  } catch {}
  return v
}

export function getTenant() {
  try { return localStorage.getItem("pw_tenant") || "default" } catch { return "default" }
}

export function setTenant(id) {
  const v = String(id || "default").trim() || "default"
  try { localStorage.setItem("pw_tenant", v) } catch {}
  return v
}

async function readJson(resp) {
  const text = await resp.text()
  try { return text ? JSON.parse(text) : null } catch { return null }
}

function authHeaders(extra) {
  const token = getToken()
  const tenant = getTenant()
  return Object.assign(
    token ? { "Authorization": "Bearer " + token } : {},
    { "cache-control": "no-store", "X-Tenant-Id": tenant },
    extra || {}
  )
}

async function handleResp(resp) {
  const json = await readJson(resp)
  if (!json) {
    const e = new Error("INVALID_RESPONSE"); e.status = resp.status; throw e
  }
  if (json.ok !== true) {
    const ec = (json.error || {}); const e = new Error(`${ec.code || "ERR"}: ${ec.message || "error"}`)
    e.code = ec.code; e.status = resp.status; throw e
  }
  return json.data
}

export async function apiGet(path) {
  return handleResp(await fetch(path, { method: "GET", headers: authHeaders() }))
}

// apiGetJson(path, { limit: 50, cursor: "..." }) → appends non-empty params as ?key=value
export async function apiGetJson(path, params) {
  let url = path
  if (params && typeof params === "object") {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== null && v !== undefined && String(v).trim() !== "") qs.set(k, String(v))
    })
    const s = qs.toString()
    if (s) url = path + "?" + s
  }
  return apiGet(url)
}

// downloadJson("export.json", data) → triggers browser file download
export function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function apiPost(path, body) {
  return handleResp(await fetch(path, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json" }),
    body: body !== undefined ? JSON.stringify(body) : undefined
  }))
}
