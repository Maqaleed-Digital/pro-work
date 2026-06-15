/*
 * SourceCitation
 *
 * Authority:
 *   - MPP-UX-001 §7.3 (Source citations — clickable; timestamp + source
 *     type + source authority)
 *   - UX-G2-INV-001 V1.1 §3.3 OBL C-04 (missing — implemented here)
 *
 * Renders an inline citation chip that links to the underlying evidence.
 * Each citation carries (sourceType, sourceAuthority, timestamp, href).
 *
 * Stricter rule (PROPOSAL §11.A2): if href is missing, citation renders
 * as non-link with a tooltip explaining the audit-trail surface comes
 * later (Day 6 brief §6). NOT a phantom link.
 *
 * Brand-neutral per §11.A5.
 *
 * Usage:
 *   renderSourceCitation({
 *     sourceType: 'wps-feed',
 *     sourceAuthority: 'GOSI',
 *     timestamp: '2026-05-10T08:23:00Z',
 *     href: '/app/#evidence/wps-2026-05',
 *     label: 'WPS feed, May 2026',
 *   })
 */

import { getLocale } from '../locale.js'

const TYPE_LABELS = {
  'wps-feed':       { en: 'WPS feed',          ar: 'تغذية حماية الأجور' },
  'gosi':           { en: 'GOSI',              ar: 'التأمينات الاجتماعية' },
  'qiwa':           { en: 'Qiwa',              ar: 'قِوى' },
  'mudad':          { en: 'Mudad',             ar: 'مُدد' },
  'nitaqat':        { en: 'Nitaqat',           ar: 'نطاقات' },
  'tenant-data':    { en: 'Your data',         ar: 'بياناتك' },
  'audit-trail':    { en: 'Audit trail',       ar: 'سجل المراجعة' },
  'evidence-pack':  { en: 'Evidence pack',     ar: 'حزمة الأدلة' },
}

function formatTimestamp(iso, locale) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', { year: 'numeric', month: 'short', day: '2-digit' })
  } catch { return '' }
}

/**
 * @param {object} opts
 * @param {string} [opts.sourceType]
 * @param {string} [opts.sourceAuthority]
 * @param {string} [opts.timestamp]      — ISO 8601
 * @param {string} [opts.href]            — link to underlying record
 * @param {string} [opts.label]           — optional human label override
 * @param {string} [opts.locale]
 * @returns {HTMLElement}
 */
export function renderSourceCitation(opts = {}) {
  const locale = opts.locale || getLocale()
  const sourceType = String(opts.sourceType || '').trim()
  const sourceAuthority = String(opts.sourceAuthority || '').trim()
  const timestamp = opts.timestamp || ''
  const href = String(opts.href || '').trim()

  const typeLabel = TYPE_LABELS[sourceType]
    ? (TYPE_LABELS[sourceType][locale] || TYPE_LABELS[sourceType].en)
    : (sourceType || (locale === 'ar' ? 'مصدر' : 'Source'))
  const label = opts.label || typeLabel
  const dateText = formatTimestamp(timestamp, locale)

  const visible = sourceAuthority
    ? `${label} · ${sourceAuthority}${dateText ? ' · ' + dateText : ''}`
    : `${label}${dateText ? ' · ' + dateText : ''}`

  const tag = href ? document.createElement('a') : document.createElement('span')
  if (href) {
    tag.href = href
    tag.setAttribute('aria-label', visible + ' — open underlying record')
  } else {
    tag.setAttribute('role', 'note')
    tag.setAttribute('aria-label', visible + ' — underlying record link unavailable in this view')
    tag.setAttribute('aria-disabled', 'true')
    tag.title = locale === 'ar'
      ? 'الرابط إلى السجل الأصلي سيتوفر في عرض سجل المراجعة'
      : 'Record link available in the audit-trail view (coming).'
  }
  tag.setAttribute('data-component', 'source-citation')
  tag.setAttribute('data-source-type', sourceType || 'unknown')

  tag.style.cssText = [
    'display: inline-flex',
    'align-items: center',
    'gap: var(--maq-space-1)',
    'padding-inline: var(--maq-space-2)',
    'padding-block: 2px',
    'background: var(--maq-neutral-100)',
    'color: ' + (href ? 'var(--maq-brand-primary)' : 'var(--maq-neutral-600)'),
    'border: 1px solid var(--maq-neutral-200)',
    'border-radius: var(--maq-radius-sm)',
    'font-family: var(--maq-font-arabic), var(--maq-font-latin)',
    'font-size: var(--maq-text-xs)',
    'text-decoration: ' + (href ? 'underline' : 'none'),
    'cursor: ' + (href ? 'pointer' : 'default'),
    'line-height: var(--maq-leading-tight)',
  ].join(';')

  const icon = document.createElement('span')
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = href ? '🔗' : '🔒'
  icon.style.cssText = 'font-size:0.85em'
  tag.appendChild(icon)

  const txt = document.createElement('span')
  txt.textContent = visible
  tag.appendChild(txt)

  return tag
}

export default renderSourceCitation
