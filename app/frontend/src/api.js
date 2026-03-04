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

async function readJson(resp) {
  const text = await resp.text()
  try { return text ? JSON.parse(text) : null } catch { return null }
}

function authHeaders(extra) {
  const token = getToken()
  return Object.assign(
    token ? { "Authorization": "Bearer " + token } : {},
    { "cache-control": "no-store" },
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

export async function apiPost(path, body) {
  return handleResp(await fetch(path, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json" }),
    body: body !== undefined ? JSON.stringify(body) : undefined
  }))
}
