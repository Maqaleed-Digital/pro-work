function getRole() {
  try {
    const v = localStorage.getItem("pw_role") || "admin"
    return v === "admin" || v === "guest" ? v : "admin"
  } catch {
    return "admin"
  }
}

export function setRole(role) {
  const v = role === "guest" ? "guest" : "admin"
  localStorage.setItem("pw_role", v)
  return v
}

export function apiRole() {
  return getRole()
}

async function readJson(resp) {
  const text = await resp.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

export async function apiGet(path) {
  const role = getRole()
  const resp = await fetch(path, {
    method: "GET",
    headers: {
      "cache-control": "no-store",
      "X-Role": role
    }
  })

  const json = await readJson(resp)

  if (!json) {
    const err = new Error("INVALID_RESPONSE")
    err.code = "INVALID_RESPONSE"
    err.status = resp.status
    throw err
  }

  if (json.ok !== true) {
    const e = json.error || { code: "UNKNOWN", message: "Unknown error" }
    const err = new Error(`${e.code}: ${e.message}`)
    err.code = e.code
    err.status = resp.status
    throw err
  }

  return json.data
}
