"use strict"

function clampInt(v, def, min, max) {
  const n = Number.parseInt(String(v ?? ""), 10)
  if (Number.isNaN(n)) return def
  return Math.min(Math.max(n, min), max)
}

function normStr(v) {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s.length ? s : null
}

function isoNow() {
  return new Date().toISOString()
}

function meta(endpoint, extra) {
  return {
    endpoint,
    timestamp: isoNow(),
    ...extra
  }
}

function getField(obj, key) {
  if (!obj) return null
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return null
  const v = obj[key]
  return v === undefined ? null : v
}

function cmpPrimitive(a, b) {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : 1
  return String(a).localeCompare(String(b))
}

function cmpByKeyDir(itemA, itemB, key, dir) {
  const av = getField(itemA, key)
  const bv = getField(itemB, key)
  const base = cmpPrimitive(av, bv)
  if (base === 0) return 0
  const m = dir === "asc" ? 1 : -1
  return m * base
}

function safeSortByKeys(arr, keyDirs) {
  const decorated = Array.isArray(arr)
    ? arr.map((item, idx) => ({ item, idx }))
    : []

  decorated.sort((a, b) => {
    for (const kd of keyDirs) {
      const key = String(kd && kd.key ? kd.key : "")
      const dir = kd && kd.dir === "asc" ? "asc" : "desc"
      if (!key) continue
      const c = cmpByKeyDir(a.item, b.item, key, dir)
      if (c !== 0) return c
    }
    return a.idx - b.idx
  })

  return decorated.map(d => d.item)
}

function sortWithFallback(items, primaryKey, primaryDir) {
  const primary = String(primaryKey || "").trim()
  const dir = String(primaryDir || "").toLowerCase() === "asc" ? "asc" : "desc"
  return safeSortByKeys(items, [
    { key: primary, dir },
    { key: "created_at", dir: "desc" },
    { key: "id", dir: "asc" }
  ])
}

function paginate(items, limit, offset) {
  const total = items.length
  const slice = items.slice(offset, offset + limit)
  const hasMore = offset + limit < total
  return {
    total,
    limit,
    offset,
    returned: slice.length,
    has_more: hasMore,
    items: slice
  }
}

function extractQuery(reqUrl) {
  try {
    const u = new URL(reqUrl, "http://127.0.0.1")
    const qp = Object.fromEntries(u.searchParams.entries())
    return { qp }
  } catch {
    return { qp: {} }
  }
}

function respondWorkersList(args) {
  const { req, res, principal, bootMeta, ok, listOut } = args
  const { qp } = extractQuery(req.url)

  const status = normStr(qp.status)
  const workerType = normStr(qp.worker_type)

  const sortBy = normStr(qp.sort_by) || "created_at"
  const sortOrder = (normStr(qp.sort_order) || "desc").toLowerCase() === "asc" ? "asc" : "desc"

  const limit = clampInt(qp.limit, 50, 1, 200)
  const offset = clampInt(qp.offset, 0, 0, 10_000_000)

  const raw = Array.isArray(listOut?.data) ? listOut.data : []
  let items = raw.slice()

  if (status) items = items.filter((w) => String(w.status || "") === String(status))
  if (workerType) items = items.filter((w) => String(w.worker_type || "").toLowerCase() === String(workerType).toLowerCase())

  const sortableKeys = new Set(["created_at", "updated_at", "name", "email", "status", "worker_type", "id"])
  const key = sortableKeys.has(sortBy) ? sortBy : "created_at"

  items = sortWithFallback(items, key, sortOrder)

  const page = paginate(items, limit, offset)

  return ok(
    res,
    {
      ...bootMeta(),
      admin: { id: principal.id, name: principal.name, role: principal.role },
      workers: page.items,
      pagination: { total: page.total, limit: page.limit, offset: page.offset, returned: page.returned, has_more: page.has_more },
      _meta: meta("/api/admin/workers", { filters_applied: { status, worker_type: workerType, sort_by: key, sort_order: sortOrder } })
    },
    200
  )
}

function respondPodsList(args) {
  const { req, res, principal, bootMeta, ok, pods } = args
  const { qp } = extractQuery(req.url)

  const state = normStr(qp.state)
  const sortBy = normStr(qp.sort_by) || "created_at"
  const sortOrder = (normStr(qp.sort_order) || "desc").toLowerCase() === "asc" ? "asc" : "desc"

  const limit = clampInt(qp.limit, 50, 1, 200)
  const offset = clampInt(qp.offset, 0, 0, 10_000_000)

  let items = Array.isArray(pods) ? pods.slice() : []
  if (state) items = items.filter((p) => String(p.state || p.status || "") === String(state))

  const sortableKeys = new Set(["created_at", "updated_at", "state", "status", "title", "name", "id"])
  const key = sortableKeys.has(sortBy) ? sortBy : "created_at"

  items = sortWithFallback(items, key, sortOrder)

  const page = paginate(items, limit, offset)

  return ok(
    res,
    {
      ...bootMeta(),
      admin: { id: principal.id, name: principal.name, role: principal.role },
      pods: page.items,
      pagination: { total: page.total, limit: page.limit, offset: page.offset, returned: page.returned, has_more: page.has_more },
      _meta: meta("/api/admin/pods", { filters_applied: { state, sort_by: key, sort_order: sortOrder } })
    },
    200
  )
}

function respondPrincipalsList(args) {
  const { req, res, principal, bootMeta, ok, principals, roles } = args
  const { qp } = extractQuery(req.url)

  const activeOnly = String(qp.active_only || "").toLowerCase() === "true"
  const sortBy = normStr(qp.sort_by) || "created_at"
  const sortOrder = (normStr(qp.sort_order) || "desc").toLowerCase() === "asc" ? "asc" : "desc"

  const limit = clampInt(qp.limit, 50, 1, 200)
  const offset = clampInt(qp.offset, 0, 0, 10_000_000)

  let items = Array.isArray(principals) ? principals.slice() : []
  if (activeOnly) items = items.filter((p) => p && p.active === true)

  const sortableKeys = new Set(["created_at", "name", "username", "role", "active", "id"])
  const key = sortableKeys.has(sortBy) ? sortBy : "created_at"

  items = sortWithFallback(items, key, sortOrder)

  const page = paginate(items, limit, offset)

  return ok(
    res,
    {
      ...bootMeta(),
      admin: { id: principal.id, name: principal.name, role: principal.role },
      principals: page.items,
      roles,
      pagination: { total: page.total, limit: page.limit, offset: page.offset, returned: page.returned, has_more: page.has_more },
      _meta: meta("/api/admin/principals", { filters_applied: { active_only: activeOnly, sort_by: key, sort_order: sortOrder } })
    },
    200
  )
}

module.exports = {
  respondWorkersList,
  respondPodsList,
  respondPrincipalsList
}
