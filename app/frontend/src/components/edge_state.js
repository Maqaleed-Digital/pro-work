/*
 * Edge-state primitives — REUSABLE across modules
 *
 * Authority:
 *   - brief §7 (Mandatory empty / error / loading / permission-denied /
 *     service-unavailable states across every list, view, and form)
 *   - Sponsor stricter rule 2026-05-14: "edge-state primitives reusable
 *     across modules, not bespoke per surface"
 *   - UX-G2 V1.1 §4.3 (Skeleton, Alert, Spinner) — semantic compliance
 *   - MPP-UX-001 §4.2 (empty-states pattern)
 *
 * Five renderers, each returning an HTMLElement. All brand-neutral per
 * PROPOSAL §11.A5; consume canonical --maq-* tokens only; bilingual
 * via getLocale().
 *
 *   renderLoadingState({ label?, variant? }) — variant: 'skeleton' | 'spinner'
 *   renderEmptyState({ icon?, title, body, actionLabel?, actionHref?, actionOnClick? })
 *   renderErrorState({ error, correlationId?, retry?, locale? })
 *   renderPermissionDeniedState({ neededRole?, contactAdmin?, locale? })
 *   renderServiceUnavailableState({ statusPageHref?, locale? })
 *
 * Each renderer accepts an optional `title`/`body` override; otherwise
 * sensible bilingual defaults render. Consumers should ALWAYS pass a
 * specific `body` for empty/error states so the message is actionable
 * (per brief §7 — empty MUST explain what data will appear and the
 * action to populate it).
 */

import { t, getLocale } from "../locale.js"

function resolveField(field, locale) {
  if (!field) return ""
  if (typeof field === "string") return field
  if (typeof field === "object") return field[locale] || field.en || ""
  return ""
}

// ── Loading ─────────────────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @param {string|object} [opts.label]
 * @param {'skeleton'|'spinner'} [opts.variant='skeleton']
 * @param {number} [opts.skeletonRows=3]
 * @returns {HTMLElement}
 */
export function renderLoadingState(opts = {}) {
  const locale = opts.locale || getLocale()
  const variant = opts.variant === "spinner" ? "spinner" : "skeleton"
  const label = resolveField(opts.label, locale) || (locale === "ar" ? "جارٍ التحميل…" : "Loading…")

  const wrap = document.createElement("div")
  wrap.setAttribute("data-edge-state", "loading")
  wrap.setAttribute("role", "status")
  wrap.setAttribute("aria-live", "polite")
  wrap.setAttribute("aria-busy", "true")

  if (variant === "spinner") {
    wrap.style.cssText = "display:flex;align-items:center;gap:var(--maq-space-3);padding:var(--maq-space-6);justify-content:center"
    const sp = document.createElement("span")
    sp.setAttribute("aria-hidden", "true")
    sp.style.cssText = "inline-size:20px;block-size:20px;border:2px solid var(--maq-neutral-300);border-block-start-color:var(--maq-brand-primary);border-radius:50%;animation:maq-spin var(--maq-duration-deliberate) linear infinite"
    wrap.appendChild(sp)
    const lbl = document.createElement("span")
    lbl.textContent = label
    lbl.style.cssText = "color:var(--maq-neutral-600);font-size:var(--maq-text-sm)"
    wrap.appendChild(lbl)
    // Inject keyframes once
    injectSpinKeyframes()
    return wrap
  }

  // Skeleton variant — N row placeholders
  wrap.style.cssText = "display:flex;flex-direction:column;gap:var(--maq-space-3);padding:var(--maq-space-4)"
  const sr = document.createElement("span")
  sr.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)"
  sr.textContent = label
  wrap.appendChild(sr)
  const rows = Math.max(1, Math.min(10, opts.skeletonRows || 3))
  for (let i = 0; i < rows; i++) {
    const row = document.createElement("div")
    row.setAttribute("aria-hidden", "true")
    const w = (60 + Math.random() * 30) | 0  // 60..90%
    row.style.cssText = `block-size:14px;inline-size:${w}%;background:var(--maq-neutral-100);border-radius:var(--maq-radius-sm);animation:maq-pulse var(--maq-duration-slow) ease-in-out infinite`
    wrap.appendChild(row)
  }
  injectPulseKeyframes()
  return wrap
}

// ── Empty ───────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} [opts.icon]
 * @param {string|object} opts.title
 * @param {string|object} opts.body
 * @param {string|object} [opts.actionLabel]
 * @param {string} [opts.actionHref]
 * @param {Function} [opts.actionOnClick]
 * @param {string} [opts.locale]
 * @returns {HTMLElement}
 */
export function renderEmptyState(opts = {}) {
  const locale = opts.locale || getLocale()
  const wrap = document.createElement("div")
  wrap.setAttribute("data-edge-state", "empty")
  wrap.setAttribute("role", "status")
  wrap.style.cssText = [
    "display: flex",
    "flex-direction: column",
    "align-items: center",
    "text-align: center",
    "padding: var(--maq-space-12) var(--maq-space-6)",
    "background: var(--maq-neutral-50)",
    "border: 1px dashed var(--maq-neutral-300)",
    "border-radius: var(--maq-radius-md)",
    "gap: var(--maq-space-3)",
  ].join(";")

  const icon = document.createElement("p")
  icon.setAttribute("aria-hidden", "true")
  icon.style.cssText = "font-size:var(--maq-text-3xl);margin:0;color:var(--maq-neutral-400)"
  icon.textContent = opts.icon || "📭"
  wrap.appendChild(icon)

  const title = document.createElement("p")
  title.style.cssText = "margin:0;font-size:var(--maq-text-lg);font-weight:var(--maq-weight-semibold);color:var(--maq-neutral-800)"
  title.textContent = resolveField(opts.title, locale)
  wrap.appendChild(title)

  const body = document.createElement("p")
  body.style.cssText = "margin:0;font-size:var(--maq-text-sm);color:var(--maq-neutral-600);max-inline-size:480px;line-height:var(--maq-leading-relaxed)"
  body.textContent = resolveField(opts.body, locale)
  wrap.appendChild(body)

  if (opts.actionLabel) {
    if (opts.actionHref) {
      const a = document.createElement("a")
      a.href = opts.actionHref
      a.textContent = resolveField(opts.actionLabel, locale)
      a.className = "btn btn-accent"
      a.style.cssText = "margin-block-start:var(--maq-space-2);text-decoration:none;display:inline-block;padding:var(--maq-space-2) var(--maq-space-4);background:var(--maq-brand-primary);color:var(--maq-brand-on-primary);border-radius:var(--maq-radius-md);font-weight:var(--maq-weight-semibold);font-size:var(--maq-text-sm)"
      wrap.appendChild(a)
    } else if (typeof opts.actionOnClick === "function") {
      const b = document.createElement("button")
      b.type = "button"
      b.textContent = resolveField(opts.actionLabel, locale)
      b.addEventListener("click", opts.actionOnClick)
      b.style.cssText = "margin-block-start:var(--maq-space-2);padding:var(--maq-space-2) var(--maq-space-4);background:var(--maq-brand-primary);color:var(--maq-brand-on-primary);border-radius:var(--maq-radius-md);border:none;font-weight:var(--maq-weight-semibold);font-size:var(--maq-text-sm);min-height:44px;cursor:pointer;font-family:inherit"
      wrap.appendChild(b)
    }
  }

  return wrap
}

// ── Error ───────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {Error|object} [opts.error]
 * @param {string} [opts.correlationId]
 * @param {Function} [opts.retry]
 * @param {string} [opts.locale]
 * @returns {HTMLElement}
 */
export function renderErrorState(opts = {}) {
  const locale = opts.locale || getLocale()
  const error = opts.error || {}

  const wrap = document.createElement("div")
  wrap.setAttribute("data-edge-state", "error")
  wrap.setAttribute("role", "alert")
  wrap.setAttribute("aria-live", "assertive")
  wrap.style.cssText = [
    "padding: var(--maq-space-4)",
    "background: var(--maq-semantic-danger-bg)",
    "color: var(--maq-semantic-danger)",
    "border: 1px solid var(--maq-semantic-danger)",
    "border-radius: var(--maq-radius-md)",
    "display: flex",
    "flex-direction: column",
    "gap: var(--maq-space-2)",
  ].join(";")

  const title = document.createElement("p")
  title.style.cssText = "margin:0;font-weight:var(--maq-weight-semibold);font-size:var(--maq-text-base)"
  title.textContent = locale === "ar" ? "حدث خطأ" : "Something went wrong"
  wrap.appendChild(title)

  // Body — actionable, no stack traces (brief §7)
  const body = document.createElement("p")
  body.style.cssText = "margin:0;font-size:var(--maq-text-sm);line-height:var(--maq-leading-relaxed)"
  body.textContent = friendlyMessage(error, locale)
  wrap.appendChild(body)

  // Correlation ID for support (brief §7)
  if (opts.correlationId || error.correlationId) {
    const cid = document.createElement("p")
    cid.style.cssText = "margin:0;font-family:var(--maq-font-mono);font-size:var(--maq-text-xs);opacity:0.75"
    cid.textContent = `${locale === "ar" ? "رمز الدعم" : "Support ref"}: ${opts.correlationId || error.correlationId}`
    wrap.appendChild(cid)
  }

  if (typeof opts.retry === "function") {
    const retryBtn = document.createElement("button")
    retryBtn.type = "button"
    retryBtn.textContent = locale === "ar" ? "إعادة المحاولة" : "Retry"
    retryBtn.style.cssText = "align-self:flex-start;margin-block-start:var(--maq-space-2);padding:var(--maq-space-2) var(--maq-space-4);background:transparent;color:var(--maq-semantic-danger);border:1px solid var(--maq-semantic-danger);border-radius:var(--maq-radius-md);cursor:pointer;font-family:inherit;font-size:var(--maq-text-sm);min-height:36px"
    retryBtn.addEventListener("click", opts.retry)
    wrap.appendChild(retryBtn)
  }

  return wrap
}

function friendlyMessage(error, locale) {
  if (!error) {
    return locale === "ar"
      ? "تعذّر إكمال الطلب. حاول التحديث، أو راجع حالة الخدمة لاحقًا."
      : "We couldn't complete the request. Try refreshing, or check service status later."
  }
  const code = error.code || ""
  if (code === "FORBIDDEN" || error.status === 403) {
    return locale === "ar"
      ? "ليس لديك الصلاحية لرؤية هذه البيانات."
      : "You don't have permission to view this data."
  }
  if (code === "UNAUTHORIZED" || error.status === 401) {
    return locale === "ar"
      ? "انتهت جلستك. سجّل الدخول مرة أخرى للمتابعة."
      : "Your session expired. Please sign in again to continue."
  }
  if (error.status === 503 || code === "SERVICE_UNAVAILABLE") {
    return locale === "ar"
      ? "الخدمة غير متاحة مؤقتًا. حاول لاحقًا أو راجع صفحة الحالة."
      : "Service is temporarily unavailable. Try again later or check the status page."
  }
  if (error.status === 404 || code === "NOT_FOUND") {
    return locale === "ar"
      ? "لم نتمكّن من العثور على البيانات المطلوبة."
      : "We couldn't find the requested data."
  }
  return locale === "ar"
    ? "تعذّر إكمال الطلب. حاول التحديث."
    : "We couldn't complete the request. Try refreshing."
}

// ── Permission denied ──────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @param {string} [opts.neededRole]
 * @param {string} [opts.locale]
 * @returns {HTMLElement}
 */
export function renderPermissionDeniedState(opts = {}) {
  const locale = opts.locale || getLocale()
  return renderEmptyState({
    icon: "🔒",
    title: { en: "You don't have access to this view",
             ar: "ليس لديك صلاحية لرؤية هذه الواجهة" },
    body:  { en: "Ask your organisation admin to grant you access. We don't disclose system details here for safety.",
             ar: "اطلب من مسؤول مؤسستك منحك الصلاحية. لا نكشف تفاصيل النظام هنا لأسباب أمنية." },
    actionLabel: { en: "Back to dashboard", ar: "العودة إلى لوحة التحكم" },
    actionHref: "#dashboard",
    locale,
  })
}

// ── Service unavailable ────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @param {string} [opts.statusPageHref]
 * @param {string} [opts.locale]
 * @returns {HTMLElement}
 */
export function renderServiceUnavailableState(opts = {}) {
  const locale = opts.locale || getLocale()
  const wrap = document.createElement("div")
  wrap.setAttribute("data-edge-state", "service-unavailable")
  wrap.setAttribute("role", "alert")
  wrap.style.cssText = [
    "padding: var(--maq-space-4)",
    "background: var(--maq-semantic-warning-bg)",
    "color: var(--maq-semantic-warning)",
    "border: 1px solid var(--maq-semantic-warning)",
    "border-radius: var(--maq-radius-md)",
  ].join(";")

  const title = document.createElement("p")
  title.style.cssText = "margin:0 0 var(--maq-space-2);font-weight:var(--maq-weight-semibold)"
  title.textContent = locale === "ar" ? "الخدمة غير متاحة مؤقتًا" : "Service temporarily unavailable"
  wrap.appendChild(title)

  const body = document.createElement("p")
  body.style.cssText = "margin:0 0 var(--maq-space-3);font-size:var(--maq-text-sm)"
  body.textContent = locale === "ar"
    ? "نعمل على إعادة الخدمة. ستظل البيانات التي تم تحميلها سابقًا متاحة."
    : "We're working on it. Any previously loaded data remains available."
  wrap.appendChild(body)

  if (opts.statusPageHref) {
    const a = document.createElement("a")
    a.href = opts.statusPageHref
    a.target = "_blank"
    a.rel = "noopener noreferrer"
    a.textContent = locale === "ar" ? "صفحة حالة الخدمة ↗" : "View status page ↗"
    a.style.cssText = "color:inherit;text-decoration:underline;font-weight:var(--maq-weight-medium)"
    wrap.appendChild(a)
  }
  return wrap
}

// ── Keyframe injection (once per page) ────────────────────────────────

let _spinKeyframesInjected = false
let _pulseKeyframesInjected = false
function injectSpinKeyframes() {
  if (_spinKeyframesInjected || typeof document === "undefined") return
  const s = document.createElement("style")
  s.textContent = "@keyframes maq-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } } @media (prefers-reduced-motion: reduce) { [data-edge-state=loading] span[aria-hidden=true] { animation: none !important } }"
  document.head.appendChild(s)
  _spinKeyframesInjected = true
}
function injectPulseKeyframes() {
  if (_pulseKeyframesInjected || typeof document === "undefined") return
  const s = document.createElement("style")
  s.textContent = "@keyframes maq-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } } @media (prefers-reduced-motion: reduce) { [data-edge-state=loading] > div { animation: none !important } }"
  document.head.appendChild(s)
  _pulseKeyframesInjected = true
}

export default {
  renderLoadingState,
  renderEmptyState,
  renderErrorState,
  renderPermissionDeniedState,
  renderServiceUnavailableState,
}
