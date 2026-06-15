// S36-G6: Risk Board component
// Three-column entity risk indicator grid: People | Projects | Compliance.
// Semantic CSS variables — no hardcoded hex colours.
// Keyboard accessible: tab + enter to expand risk detail.

// Semantic risk colour variables — matched in style.css
const RISK_STYLES = {
  green:   { dot: "var(--colour-success,  #22c55e)", bg: "var(--colour-success-muted,  #f0fdf4)" },
  amber:   { dot: "var(--colour-warning,  #f59e0b)", bg: "var(--colour-warning-muted,  #fffbeb)" },
  red:     { dot: "var(--colour-danger,   #ef4444)", bg: "var(--colour-danger-muted,   #fef2f2)" },
  unknown: { dot: "var(--colour-text-muted, #9ca3af)", bg: "var(--colour-surface-muted, #f9fafb)" },
}

function riskDot(level) {
  const style = RISK_STYLES[level] || RISK_STYLES.unknown
  const dot = document.createElement("span")
  dot.style.cssText = [
    `background:${style.dot}`,
    "display:inline-block",
    "width:10px",
    "height:10px",
    "border-radius:50%",
    "flex-shrink:0",
    "margin-block-start:3px",
  ].join(";")
  dot.setAttribute("aria-hidden", "true")
  return dot
}

function riskRow(entry) {
  const row = document.createElement("div")
  row.style.cssText = [
    "display:flex",
    "gap:8px",
    "align-items:flex-start",
    "padding:6px 8px",
    "border-radius:6px",
    "cursor:pointer",
  ].join(";")
  row.setAttribute("tabindex", "0")
  row.setAttribute("role", "button")
  row.setAttribute("aria-label", `${entry.label}: ${entry.level} risk — ${entry.reason}`)

  const style = RISK_STYLES[entry.level] || RISK_STYLES.unknown

  row.appendChild(riskDot(entry.level))

  const textWrap = document.createElement("div")
  textWrap.style.cssText = "flex:1;min-width:0"

  const nameEl = document.createElement("div")
  nameEl.style.cssText = "font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
  nameEl.textContent = entry.label || entry.id

  const reasonEl = document.createElement("div")
  reasonEl.id = `risk-reason-${entry.id}`
  reasonEl.style.cssText = [
    `background:${style.bg}`,
    "font-size:11px",
    "color:#6b7280",
    "display:none",
    "margin-block-start:4px",
    "padding:4px 6px",
    "border-radius:4px",
  ].join(";")
  reasonEl.setAttribute("role", "tooltip")
  reasonEl.textContent = entry.reason

  textWrap.appendChild(nameEl)
  textWrap.appendChild(reasonEl)
  row.appendChild(textWrap)

  // Toggle reason on click or Enter key
  function toggle() {
    const hidden = reasonEl.style.display === "none"
    reasonEl.style.display = hidden ? "block" : "none"
    row.style.background = hidden ? style.bg : ""
  }

  row.addEventListener("click", toggle)
  row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle() } })

  return row
}

function columnEl(title, entries) {
  const col = document.createElement("div")
  col.style.cssText = [
    "flex:1",
    "min-width:200px",
    "background:var(--colour-surface, #fff)",
    "border:1px solid var(--colour-border, #e5e7eb)",
    "border-radius:8px",
    "overflow:hidden",
  ].join(";")
  col.setAttribute("role", "region")
  col.setAttribute("aria-label", title + " risk")

  const header = document.createElement("div")
  header.style.cssText = [
    "padding:10px 12px",
    "font-size:12px",
    "font-weight:700",
    "color:#374151",
    "border-block-end:1px solid var(--colour-border, #e5e7eb)",
    "background:var(--colour-surface-muted, #f9fafb)",
  ].join(";")
  header.textContent = title
  col.appendChild(header)

  const body = document.createElement("div")
  body.style.cssText = "padding:8px;display:flex;flex-direction:column;gap:2px"

  if (!entries || entries.length === 0) {
    const empty = document.createElement("div")
    empty.style.cssText = "font-size:12px;color:#9ca3af;padding:8px"
    empty.textContent = "No entities"
    body.appendChild(empty)
  } else {
    entries.forEach(e => body.appendChild(riskRow(e)))
  }

  col.appendChild(body)
  return col
}

/**
 * Create the Risk Board component.
 *
 * @param {Object} entities  - { people: [], projects: [], compliance: [] }
 * @returns {HTMLElement}
 */
export function createRiskBoard(entities = {}) {
  const board = document.createElement("div")
  board.className = "risk-board"
  board.setAttribute("role", "main")
  board.setAttribute("aria-label", "Entity risk board")
  board.style.cssText = [
    "display:flex",
    "gap:12px",
    "flex-wrap:wrap",
    "padding:16px",
  ].join(";")

  board.appendChild(columnEl("People",     entities.people     || []))
  board.appendChild(columnEl("Projects",   entities.projects   || []))
  board.appendChild(columnEl("Compliance", entities.compliance || []))

  return board
}
