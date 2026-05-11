/*
 * AuditTrailLink
 *
 * Authority:
 *   - MPP-UX-001 §7.6 (Audit-trail deep link from every agent output)
 *   - UX-G2-INV-001 V1.1 §3.6 OBL F-01 (missing — implemented here as
 *     surface primitive; the audit-trail viewer itself ships Day 6
 *     brief §6)
 *
 * Day 4 status: this primitive renders the link; the audit-trail viewer
 * surface is built Day 6. When `href` is missing or the audit-trail
 * surface is not yet shipped, the link renders as a disabled chip with
 * an explanatory tooltip per PROPOSAL §11.A4 (NO PHANTOM FEATURES — no
 * dead clicks). On Day 6 the existing href routes pass through cleanly
 * without component change.
 *
 * Brand-neutral per §11.A5.
 *
 * Usage:
 *   renderAuditTrailLink({ correlationId: 'agent-out-abc123', href: '/app/#evidence/abc123' })
 *   renderAuditTrailLink({ correlationId: 'agent-out-abc123' })  // disabled placeholder
 */

import { getLocale } from '../locale.js'

/**
 * @param {object} opts
 * @param {string} [opts.correlationId]
 * @param {string} [opts.href]
 * @param {string} [opts.locale]
 * @returns {HTMLElement}
 */
export function renderAuditTrailLink(opts = {}) {
  const locale = opts.locale || getLocale()
  const href = String(opts.href || '').trim()
  const cid = String(opts.correlationId || '').trim()

  const label = locale === 'ar' ? 'عرض سجل المراجعة' : 'View audit trail'
  const placeholderTip = locale === 'ar'
    ? 'سجل المراجعة سيُتاح من يوم 6 (موجز الإصدار التجريبي §6).'
    : 'Audit-trail view ships in Day 6 (brief §6).'

  const el = href ? document.createElement('a') : document.createElement('span')
  if (href) {
    el.href = href
    el.setAttribute('aria-label', label + (cid ? ` (ref ${cid})` : ''))
  } else {
    el.setAttribute('role', 'note')
    el.setAttribute('aria-disabled', 'true')
    el.setAttribute('aria-label', label + ' — ' + (locale === 'ar' ? 'سيُتاح قريبًا' : 'coming soon'))
    el.title = placeholderTip
  }
  el.setAttribute('data-component', 'audit-trail-link')
  if (cid) el.setAttribute('data-correlation-id', cid)

  el.style.cssText = [
    'display: inline-flex',
    'align-items: center',
    'gap: var(--maq-space-1)',
    'padding-inline: var(--maq-space-2)',
    'padding-block: var(--maq-space-1)',
    'font-family: var(--maq-font-arabic), var(--maq-font-latin)',
    'font-size: var(--maq-text-xs)',
    'color: ' + (href ? 'var(--maq-brand-primary)' : 'var(--maq-neutral-400)'),
    'text-decoration: ' + (href ? 'underline' : 'none'),
    'cursor: ' + (href ? 'pointer' : 'not-allowed'),
    'border-radius: var(--maq-radius-sm)',
  ].join(';')

  const icon = document.createElement('span')
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = '📋'
  icon.style.cssText = 'font-size:0.9em'
  el.appendChild(icon)

  const txt = document.createElement('span')
  txt.textContent = label
  el.appendChild(txt)

  return el
}

export default renderAuditTrailLink
