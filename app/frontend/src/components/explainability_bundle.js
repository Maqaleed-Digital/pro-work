/*
 * ExplainabilityBundle
 *
 * Authority:
 *   - MPP-UX-001 §7.3 (Layered explainability — Layer 1 Summary /
 *     Layer 2 Detail / Layer 3 Audit-trail)
 *   - UX-G2-INV-001 V1.1 §10.4 (layered disclosure as enforced design rule:
 *     "every surface that displays agent or intelligence content with more
 *     than two evidence factors must implement layered disclosure")
 *   - UX-G2-INV-001 V1.1 §3.3 OBL C-03 (missing — implemented here)
 *
 * Structure (per §10.4):
 *   Layer 1 — Summary    (top 3 factors; default visible)
 *   Layer 2 — Detail     (full factor list; expandable via <details>)
 *   Layer 3 — Audit trail (deep-link via AuditTrailLink to the audit-trail
 *                          surface where reconstructibility chain renders)
 *
 * Stricter rule (PROPOSAL §11.A2): components consuming this bundle pass
 * `factors[]`; if the array is empty the bundle renders a single advisory
 * note explaining no factors were captured for this output (rather than
 * being silently absent).
 *
 * Brand-neutral per §11.A5. Uses <details>/<summary> for native keyboard
 * accessibility (WCAG 2.1.1, 2.4.7).
 *
 * Usage:
 *   renderExplainabilityBundle({
 *     factors: [
 *       { label: 'Saudi headcount', value: '40%', magnitude: 'high', direction: 'positive', citation: {...} },
 *       { label: 'Nitaqat zone',    value: 'Green', magnitude: 'medium', direction: 'neutral' },
 *       ...
 *     ],
 *     auditTrailHref: '/app/#evidence/agent-output-abc123',
 *     locale: 'en',
 *   })
 */

import { t, getLocale } from '../locale.js'
import { renderSourceCitation } from './source_citation.js'

const DIRECTION_GLYPH = {
  positive: '↑',
  negative: '↓',
  neutral:  '→',
}

const DIRECTION_LABELS = {
  positive: { en: 'positive',    ar: 'إيجابي' },
  negative: { en: 'negative',    ar: 'سلبي' },
  neutral:  { en: 'neutral',     ar: 'محايد' },
}

const MAGNITUDE_LABELS = {
  high:   { en: 'high',   ar: 'مرتفع' },
  medium: { en: 'medium', ar: 'متوسط' },
  low:    { en: 'low',    ar: 'منخفض' },
}

/**
 * @typedef {object} Factor
 * @property {string} label
 * @property {string} [value]
 * @property {'high'|'medium'|'low'} [magnitude]
 * @property {'positive'|'negative'|'neutral'} [direction]
 * @property {object} [citation]  — pass-through to renderSourceCitation
 */

/**
 * @param {object} opts
 * @param {Factor[]} opts.factors
 * @param {string} [opts.auditTrailHref]
 * @param {string} [opts.locale]
 * @returns {HTMLElement}
 */
export function renderExplainabilityBundle(opts = {}) {
  const locale = opts.locale || getLocale()
  const factors = Array.isArray(opts.factors) ? opts.factors : []
  const auditHref = opts.auditTrailHref || ''

  const wrap = document.createElement('section')
  wrap.setAttribute('data-component', 'explainability-bundle')
  wrap.setAttribute('aria-label', locale === 'ar' ? 'تفسير القرار' : 'Decision explanation')
  wrap.style.cssText = [
    'background: var(--maq-neutral-50)',
    'border: 1px solid var(--maq-neutral-200)',
    'border-radius: var(--maq-radius-md)',
    'padding: var(--maq-space-4)',
    'margin-block: var(--maq-space-3)',
    'font-family: var(--maq-font-arabic), var(--maq-font-latin)',
    'font-size: var(--maq-text-sm)',
    'color: var(--maq-neutral-700)',
    'line-height: var(--maq-leading-relaxed)',
  ].join(';')

  // ── Empty-state guard ──────────────────────────────────────────────
  if (factors.length === 0) {
    const note = document.createElement('p')
    note.setAttribute('role', 'note')
    note.style.cssText = 'margin:0;color:var(--maq-neutral-500);font-style:italic'
    note.textContent = locale === 'ar'
      ? 'لم يتم التقاط عوامل تفسيرية لهذا المخرج.'
      : 'No explanatory factors were captured for this output.'
    wrap.appendChild(note)
    return wrap
  }

  // ── Layer 1 — Summary (top 3 factors, default visible) ─────────────
  const heading = document.createElement('h4')
  heading.style.cssText = 'margin:0 0 var(--maq-space-3);font-size:var(--maq-text-xs);font-weight:var(--maq-weight-semibold);text-transform:uppercase;letter-spacing:var(--maq-tracking-wide);color:var(--maq-neutral-600)'
  heading.textContent = locale === 'ar' ? 'العوامل الرئيسية (الطبقة 1)' : 'Top factors (Layer 1)'
  wrap.appendChild(heading)

  const top = factors.slice(0, 3)
  const summaryList = document.createElement('ul')
  summaryList.style.cssText = 'list-style:none;padding:0;margin:0 0 var(--maq-space-3);display:flex;flex-direction:column;gap:var(--maq-space-2)'
  for (const f of top) summaryList.appendChild(renderFactorRow(f, locale))
  wrap.appendChild(summaryList)

  // ── Layer 2 — Detail (expandable; full factor list) ────────────────
  if (factors.length > 3) {
    const details = document.createElement('details')
    details.style.cssText = 'margin-block:var(--maq-space-2)'
    const summary = document.createElement('summary')
    summary.style.cssText = 'cursor:pointer;font-weight:var(--maq-weight-medium);color:var(--maq-brand-primary);font-size:var(--maq-text-sm);padding-block:var(--maq-space-1)'
    summary.textContent = locale === 'ar'
      ? `عرض كل العوامل (${factors.length}) — الطبقة 2`
      : `Show all factors (${factors.length}) — Layer 2`
    details.appendChild(summary)

    const fullList = document.createElement('ul')
    fullList.style.cssText = 'list-style:none;padding:0;margin:var(--maq-space-3) 0 0;display:flex;flex-direction:column;gap:var(--maq-space-2)'
    for (const f of factors.slice(3)) fullList.appendChild(renderFactorRow(f, locale))
    details.appendChild(fullList)
    wrap.appendChild(details)
  }

  // ── Layer 3 — Audit-trail deep link ────────────────────────────────
  const layer3 = document.createElement('p')
  layer3.style.cssText = 'margin:var(--maq-space-3) 0 0;font-size:var(--maq-text-xs);color:var(--maq-neutral-500)'
  const layer3Label = locale === 'ar' ? 'الطبقة 3 — سجل المراجعة الكامل: ' : 'Layer 3 — full audit trail: '
  layer3.appendChild(document.createTextNode(layer3Label))

  if (auditHref) {
    const a = document.createElement('a')
    a.href = auditHref
    a.textContent = locale === 'ar' ? 'عرض السجل' : 'View record'
    a.style.cssText = 'color:var(--maq-brand-primary);text-decoration:underline'
    layer3.appendChild(a)
  } else {
    const spn = document.createElement('span')
    spn.setAttribute('aria-disabled', 'true')
    spn.style.cssText = 'color:var(--maq-neutral-400);font-style:italic'
    spn.textContent = locale === 'ar'
      ? 'عرض السجل — قادم في الإصدار التجريبي (اليوم 6)'
      : 'Record view — coming in beta (Day 6)'
    layer3.appendChild(spn)
  }
  wrap.appendChild(layer3)

  return wrap
}

function renderFactorRow(f, locale) {
  const li = document.createElement('li')
  li.style.cssText = 'display:flex;align-items:start;gap:var(--maq-space-3);padding:var(--maq-space-2);background:var(--maq-neutral-0);border:1px solid var(--maq-neutral-200);border-radius:var(--maq-radius-sm)'

  // Direction glyph (decorative; magnitude conveyed via text)
  const dir = document.createElement('span')
  dir.setAttribute('aria-hidden', 'true')
  dir.style.cssText = 'font-size:var(--maq-text-base);font-weight:var(--maq-weight-bold);flex-shrink:0;min-inline-size:1em'
  dir.textContent = DIRECTION_GLYPH[f.direction] || DIRECTION_GLYPH.neutral
  if (f.direction === 'positive') dir.style.color = 'var(--maq-semantic-success)'
  else if (f.direction === 'negative') dir.style.color = 'var(--maq-semantic-danger)'
  else dir.style.color = 'var(--maq-neutral-500)'
  li.appendChild(dir)

  const body = document.createElement('div')
  body.style.cssText = 'flex:1;min-inline-size:0'

  const labelRow = document.createElement('div')
  labelRow.style.cssText = 'display:flex;justify-content:space-between;gap:var(--maq-space-3);align-items:baseline'

  const lbl = document.createElement('span')
  lbl.style.cssText = 'font-weight:var(--maq-weight-medium);color:var(--maq-neutral-800)'
  lbl.textContent = f.label || ''
  labelRow.appendChild(lbl)

  if (f.value) {
    const val = document.createElement('span')
    val.style.cssText = 'font-family:var(--maq-font-mono);color:var(--maq-neutral-700);font-size:var(--maq-text-sm)'
    val.textContent = f.value
    labelRow.appendChild(val)
  }
  body.appendChild(labelRow)

  // Aria-hidden meta line for human readers; aria-label below covers a11y.
  if (f.magnitude || f.direction) {
    const meta = document.createElement('span')
    meta.style.cssText = 'display:block;font-size:var(--maq-text-xs);color:var(--maq-neutral-500);margin-block-start:var(--maq-space-1)'
    const parts = []
    if (f.magnitude) parts.push(MAGNITUDE_LABELS[f.magnitude] ? (MAGNITUDE_LABELS[f.magnitude][locale] || f.magnitude) : f.magnitude)
    if (f.direction) parts.push(DIRECTION_LABELS[f.direction] ? (DIRECTION_LABELS[f.direction][locale] || f.direction) : f.direction)
    meta.textContent = parts.join(' · ')
    body.appendChild(meta)
  }

  // Optional citation pass-through
  if (f.citation) {
    const cite = renderSourceCitation({ ...f.citation, locale })
    cite.style.marginBlockStart = 'var(--maq-space-2)'
    body.appendChild(cite)
  }

  li.appendChild(body)

  // a11y: combined aria-label for screen readers
  const ariaParts = [f.label, f.value, f.direction, f.magnitude].filter(Boolean)
  li.setAttribute('aria-label', ariaParts.join(' · '))

  return li
}

export default renderExplainabilityBundle
