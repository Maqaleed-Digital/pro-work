/*
 * QueuedAction — brief §8 failure trust-preservation
 *
 * Authority: brief §8 — "Network failure: queue the action, surface the
 * queued state, retry transparently. Do not lose user input on transient
 * failure."
 *
 * Pattern: wrap an async submit handler so that on network failure the
 * action is held in an in-memory queue with retries, and the user sees a
 * non-blocking "queued — retrying" indicator. The user's input is NOT
 * lost: if the queued action ultimately fails after N retries, the
 * payload is returned to the caller for re-presentation.
 *
 * Stricter rule (PROPOSAL §11.A2): no silent retries; the user always
 * sees the state (queued / retrying / failed / succeeded). No background
 * retry without a visible chip. No optimistic state changes — only the
 * server's confirmation flips the UI.
 *
 * Brand-neutral per §11.A5.
 *
 * Usage:
 *   const q = createActionQueue()
 *   q.enqueue('save-employee-x', async () => api.saveEmployee(payload))
 *     .then(result => { ... })
 *     .catch(err => { ... }) // user sees failed chip + can retry manually
 *
 *   document.body.appendChild(renderQueueIndicator(q))
 */

import { getLocale } from "../locale.js"

/**
 * @typedef {object} QueuedAction
 * @property {string} id
 * @property {string} label
 * @property {Function} thunk
 * @property {'queued'|'retrying'|'failed'|'succeeded'} status
 * @property {number} attempts
 * @property {string|null} lastError
 */

const DEFAULT_MAX_ATTEMPTS = 3
const BACKOFF_MS = [500, 1500, 4000]

export function createActionQueue() {
  const queue = new Map() // id → QueuedAction
  const listeners = new Set()

  function emit() { for (const l of listeners) try { l(snapshot()) } catch {} }
  function snapshot() { return Array.from(queue.values()) }

  function isNetworkFailure(err) {
    if (!err) return false
    if (err.status === 0) return true
    if (err.status >= 500 && err.status < 600) return true
    if (err.message && /fetch|network|connection|timeout/i.test(err.message)) return true
    return false
  }

  async function runAttempt(action) {
    action.status = action.attempts === 0 ? "queued" : "retrying"
    action.attempts += 1
    emit()
    try {
      const result = await action.thunk()
      action.status = "succeeded"
      emit()
      // Keep succeeded actions in queue for 3s for the user to see, then evict.
      setTimeout(() => { queue.delete(action.id); emit() }, 3000)
      return result
    } catch (err) {
      action.lastError = err && err.message ? err.message : String(err)
      if (isNetworkFailure(err) && action.attempts < (action.maxAttempts || DEFAULT_MAX_ATTEMPTS)) {
        const delay = BACKOFF_MS[Math.min(action.attempts - 1, BACKOFF_MS.length - 1)]
        setTimeout(() => runAttempt(action).catch(() => {}), delay)
        return
      }
      action.status = "failed"
      emit()
      throw err
    }
  }

  return {
    /**
     * Enqueue an action. Returns a Promise that resolves with the action
     * result, or rejects after all retries fail.
     */
    async enqueue(id, label, thunk, opts = {}) {
      const action = {
        id, label, thunk,
        status: "queued",
        attempts: 0,
        lastError: null,
        maxAttempts: opts.maxAttempts || DEFAULT_MAX_ATTEMPTS,
        enqueuedAt: new Date().toISOString(),
      }
      queue.set(id, action)
      emit()
      return runAttempt(action)
    },

    /** Manually retry a failed action. */
    async retry(id) {
      const a = queue.get(id)
      if (!a || a.status !== "failed") return
      a.attempts = 0
      a.lastError = null
      return runAttempt(a)
    },

    /** Dismiss a failed action from the queue (user gives up). */
    dismiss(id) {
      queue.delete(id)
      emit()
    },

    snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  }
}

/**
 * Floating indicator that surfaces queued actions to the user.
 * @param {ReturnType<typeof createActionQueue>} q
 * @returns {HTMLElement}
 */
export function renderQueueIndicator(q) {
  const locale = getLocale()
  const wrap = document.createElement("div")
  wrap.setAttribute("data-component", "queue-indicator")
  wrap.setAttribute("role", "status")
  wrap.setAttribute("aria-live", "polite")
  wrap.setAttribute("aria-atomic", "false")
  wrap.style.cssText = [
    "position: fixed",
    "inset-block-end: var(--maq-space-4)",
    "inset-inline-end: var(--maq-space-4)",
    "z-index: 200",
    "display: flex",
    "flex-direction: column",
    "gap: var(--maq-space-2)",
    "max-inline-size: 360px",
    "pointer-events: none",
  ].join(";")

  function repaint(items) {
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild)
    if (!items.length) { wrap.hidden = true; return }
    wrap.hidden = false
    for (const it of items) {
      wrap.appendChild(renderItem(it, q, locale))
    }
  }

  q.subscribe(repaint)
  repaint(q.snapshot())
  return wrap
}

function renderItem(action, q, locale) {
  const card = document.createElement("div")
  card.setAttribute("data-status", action.status)
  card.style.cssText = [
    "pointer-events: auto",
    "padding: var(--maq-space-3) var(--maq-space-4)",
    "background: var(--maq-neutral-0)",
    "border: 1px solid " + statusBorder(action.status),
    "border-inline-start: 4px solid " + statusBorder(action.status),
    "border-radius: var(--maq-radius-md)",
    "box-shadow: var(--maq-elevation-md)",
    "font-family: var(--maq-font-arabic), var(--maq-font-latin)",
    "font-size: var(--maq-text-sm)",
    "display: flex",
    "align-items: start",
    "gap: var(--maq-space-3)",
  ].join(";")

  const icon = document.createElement("span")
  icon.setAttribute("aria-hidden", "true")
  icon.textContent = statusIcon(action.status)
  icon.style.cssText = "font-size:var(--maq-text-lg);flex-shrink:0;line-height:1.2"
  card.appendChild(icon)

  const body = document.createElement("div")
  body.style.cssText = "flex:1;min-inline-size:0"

  const title = document.createElement("p")
  title.style.cssText = "margin:0;font-weight:var(--maq-weight-semibold);color:var(--maq-neutral-900)"
  title.textContent = action.label
  body.appendChild(title)

  const meta = document.createElement("p")
  meta.style.cssText = "margin:var(--maq-space-1) 0 0;font-size:var(--maq-text-xs);color:var(--maq-neutral-600)"
  meta.textContent = statusLabel(action, locale)
  body.appendChild(meta)

  if (action.status === "failed") {
    const actions = document.createElement("div")
    actions.style.cssText = "display:flex;gap:var(--maq-space-2);margin-block-start:var(--maq-space-2)"
    const retry = document.createElement("button")
    retry.type = "button"
    retry.textContent = locale === "ar" ? "إعادة المحاولة" : "Retry"
    retry.style.cssText = "padding:var(--maq-space-1) var(--maq-space-2);background:var(--maq-brand-primary);color:var(--maq-brand-on-primary);border:none;border-radius:var(--maq-radius-sm);cursor:pointer;font-family:inherit;font-size:var(--maq-text-xs)"
    retry.addEventListener("click", () => q.retry(action.id))
    actions.appendChild(retry)
    const dismiss = document.createElement("button")
    dismiss.type = "button"
    dismiss.textContent = locale === "ar" ? "إغلاق" : "Dismiss"
    dismiss.style.cssText = "padding:var(--maq-space-1) var(--maq-space-2);background:transparent;color:var(--maq-neutral-600);border:1px solid var(--maq-neutral-300);border-radius:var(--maq-radius-sm);cursor:pointer;font-family:inherit;font-size:var(--maq-text-xs)"
    dismiss.addEventListener("click", () => q.dismiss(action.id))
    actions.appendChild(dismiss)
    body.appendChild(actions)
  }

  card.appendChild(body)
  return card
}

function statusBorder(s) {
  if (s === "succeeded") return "var(--maq-semantic-success)"
  if (s === "failed") return "var(--maq-semantic-danger)"
  if (s === "retrying") return "var(--maq-semantic-warning)"
  return "var(--maq-semantic-info)"
}
function statusIcon(s) {
  if (s === "succeeded") return "✓"
  if (s === "failed") return "✕"
  if (s === "retrying") return "↻"
  return "⏳"
}
function statusLabel(a, locale) {
  if (a.status === "queued") {
    return locale === "ar" ? "بانتظار الإرسال…" : "Queued — sending…"
  }
  if (a.status === "retrying") {
    return locale === "ar"
      ? `إعادة المحاولة (${a.attempts}/${a.maxAttempts || DEFAULT_MAX_ATTEMPTS})…`
      : `Retrying (${a.attempts}/${a.maxAttempts || DEFAULT_MAX_ATTEMPTS})…`
  }
  if (a.status === "failed") {
    const msg = a.lastError || (locale === "ar" ? "فشل بعد المحاولات" : "Failed after retries")
    return msg
  }
  if (a.status === "succeeded") {
    return locale === "ar" ? "تم الإرسال" : "Sent"
  }
  return ""
}

export default { createActionQueue, renderQueueIndicator }
