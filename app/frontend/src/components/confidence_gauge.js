// S36-G2: Confidence Gauge component
// Visual bar 0–100%, colour-coded, accessible aria-label.
// No inline left/right — uses logical CSS properties for RTL compatibility.

/**
 * Create a confidence gauge element.
 *
 * @param {number} score - value between 0 and 1 (e.g. 0.87)
 * @returns {HTMLElement}
 */
export function createConfidenceGauge(score) {
  const pct = Math.round(Math.max(0, Math.min(1, score || 0)) * 100)

  // Colour band: red < 50%, amber 50–74%, green >= 75%
  const colour = pct >= 75 ? "var(--colour-success, #22c55e)"
               : pct >= 50 ? "var(--colour-warning, #f59e0b)"
               :              "var(--colour-danger,  #ef4444)"

  const label = pct >= 75 ? "High confidence"
              : pct >= 50 ? "Moderate confidence"
              :              "Low confidence"

  const wrap = document.createElement("div")
  wrap.className = "confidence-gauge"
  wrap.setAttribute("role", "meter")
  wrap.setAttribute("aria-valuenow", String(pct))
  wrap.setAttribute("aria-valuemin", "0")
  wrap.setAttribute("aria-valuemax", "100")
  wrap.setAttribute("aria-label", `Confidence: ${pct}% — ${label}`)
  wrap.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:6px",
  ].join(";")

  // Track
  const track = document.createElement("div")
  track.style.cssText = [
    "flex:1",
    "height:8px",
    "border-radius:4px",
    "background:var(--colour-surface-muted, #e5e7eb)",
    "overflow:hidden",
    "min-width:60px",
  ].join(";")

  // Fill — use margin-inline-start:0 so direction is inherited, not hardcoded
  const fill = document.createElement("div")
  fill.style.cssText = [
    `width:${pct}%`,
    "height:100%",
    `background:${colour}`,
    "border-radius:4px",
    "transition:width 0.3s ease",
  ].join(";")

  track.appendChild(fill)

  // Percentage label
  const num = document.createElement("span")
  num.style.cssText = [
    "font-size:11px",
    "font-weight:600",
    `color:${colour}`,
    "white-space:nowrap",
    "min-width:32px",
    "text-align:end",   // logical — respects RTL
  ].join(";")
  num.textContent = pct + "%"

  wrap.appendChild(track)
  wrap.appendChild(num)

  return wrap
}
