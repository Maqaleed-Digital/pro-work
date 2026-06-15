// S36-G6: KPI Strip component
// Top bar with four live tiles — polls /api/admin/dashboard/kpi every 30s.
// Logical CSS throughout. CSS variables for semantic colours.
// Skeleton loading state on first render.

import { apiGetJson } from "../api.js"

const POLL_INTERVAL_MS = 30_000;

const KPI_DEFS = [
  { key: "workforce",    label: "Workforce",    unit: "%", link: "#workers"     },
  { key: "compliance",   label: "Compliance",   unit: "%", link: "#governance"  },
  { key: "trustScore",   label: "Trust Score",  unit: "%", link: "#evidence"    },
  { key: "costVsBudget", label: "vs Budget",    unit: "%", link: "#analytics"   },
]

const STATUS_STYLES = {
  green:   { bg: "var(--colour-success-muted, #f0fdf4)", fg: "var(--colour-success, #22c55e)" },
  amber:   { bg: "var(--colour-warning-muted, #fffbeb)", fg: "var(--colour-warning, #f59e0b)" },
  red:     { bg: "var(--colour-danger-muted,  #fef2f2)", fg: "var(--colour-danger,  #ef4444)" },
  unknown: { bg: "var(--colour-surface-muted, #f9fafb)", fg: "var(--colour-text-muted, #9ca3af)" },
}

function statusArrow(status) {
  if (status === "green")   return "↑"
  if (status === "amber")   return "→"
  if (status === "red")     return "↓"
  return ""
}

function tileEl(def, kpi) {
  const style = STATUS_STYLES[kpi.status] || STATUS_STYLES.unknown
  const value = kpi.value !== null && kpi.value !== undefined
    ? String(kpi.value) + def.unit
    : "—"

  const tile = document.createElement("a")
  tile.href = def.link
  tile.setAttribute("role", "region")
  tile.setAttribute("aria-label", `${def.label}: ${value}`)
  tile.style.cssText = [
    `background:${style.bg}`,
    "border:1px solid var(--colour-border, #e5e7eb)",
    "border-radius:10px",
    "padding:14px 18px",
    "text-decoration:none",
    "display:flex",
    "flex-direction:column",
    "gap:4px",
    "flex:1",
    "min-width:140px",
    "cursor:pointer",
    "transition:box-shadow .15s",
  ].join(";")

  tile.addEventListener("mouseenter", () => { tile.style.boxShadow = "0 2px 8px rgba(0,0,0,.08)" })
  tile.addEventListener("mouseleave", () => { tile.style.boxShadow = "" })

  const label = document.createElement("span")
  label.style.cssText = "font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.04em"
  label.textContent = def.label

  const valRow = document.createElement("div")
  valRow.style.cssText = "display:flex;align-items:baseline;gap:6px"

  const valEl = document.createElement("span")
  valEl.style.cssText = `font-size:26px;font-weight:800;color:${style.fg};line-height:1`
  valEl.textContent = value

  const arrow = document.createElement("span")
  arrow.style.cssText = `font-size:16px;color:${style.fg}`
  arrow.setAttribute("aria-hidden", "true")
  arrow.textContent = statusArrow(kpi.status)

  valRow.appendChild(valEl)
  valRow.appendChild(arrow)

  const rawEl = document.createElement("span")
  rawEl.style.cssText = "font-size:10px;color:#9ca3af"
  if (kpi.rawCounts) {
    rawEl.textContent = `${kpi.rawCounts.active} / ${kpi.rawCounts.total}`
  } else if (kpi.status === "unknown") {
    rawEl.textContent = "Data unavailable"
  }

  tile.appendChild(label)
  tile.appendChild(valRow)
  tile.appendChild(rawEl)
  return tile
}

function skeletonTile() {
  const tile = document.createElement("div")
  tile.style.cssText = [
    "background:var(--colour-surface-muted, #f9fafb)",
    "border:1px solid var(--colour-border, #e5e7eb)",
    "border-radius:10px",
    "padding:14px 18px",
    "flex:1",
    "min-width:140px",
    "animation:pulse 1.5s ease-in-out infinite",
  ].join(";")
  const bar1 = document.createElement("div")
  bar1.style.cssText = "height:10px;background:#e5e7eb;border-radius:4px;width:60%;margin-bottom:8px"
  const bar2 = document.createElement("div")
  bar2.style.cssText = "height:24px;background:#e5e7eb;border-radius:4px;width:40%"
  tile.appendChild(bar1)
  tile.appendChild(bar2)
  return tile
}

/**
 * Create the KPI Strip component.
 * Polls /api/admin/dashboard/kpi every 30s.
 *
 * @param {Object}  [opts]
 * @param {boolean} [opts.autoStart=true]  - start polling on mount
 * @returns {{ el: HTMLElement, stop: () => void }}
 */
export function createKpiStrip({ autoStart = true } = {}) {
  const strip = document.createElement("div")
  strip.className = "kpi-strip"
  strip.setAttribute("role", "banner")
  strip.setAttribute("aria-label", "Key performance indicators")
  strip.style.cssText = [
    "display:flex",
    "gap:12px",
    "flex-wrap:wrap",
    "padding:16px",
    "background:var(--colour-surface, #fff)",
    "border-block-end:1px solid var(--colour-border, #e5e7eb)",
  ].join(";")

  // Skeleton tiles on initial load
  KPI_DEFS.forEach(() => strip.appendChild(skeletonTile()))

  let _pollTimer = null
  let _destroyed = false

  function renderTiles(kpis) {
    strip.innerHTML = ""
    KPI_DEFS.forEach(def => {
      const kpi  = kpis[def.key] || { value: null, status: "unknown" }
      strip.appendChild(tileEl(def, kpi))
    })
  }

  async function refresh() {
    if (_destroyed) return
    try {
      const data = await apiGetJson("/api/admin/dashboard/kpi", {})
      if (!_destroyed && data && data.kpis) renderTiles(data.kpis)
    } catch {
      // silently retain current state on poll failure
    }
  }

  function start() {
    refresh()
    _pollTimer = setInterval(refresh, POLL_INTERVAL_MS)
  }

  function stop() {
    _destroyed = true
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
  }

  if (autoStart) start()

  return { el: strip, stop, refresh }
}
