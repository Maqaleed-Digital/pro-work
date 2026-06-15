/*
 * KPICard
 *
 * Authority:
 *   - MPP-UX-001 §5.4 (canonical dashboard grammar — count, currency,
 *     ratio, status, trend taxonomy)
 *   - UX-G2-INV-001 V1.1 §3.14 OBL N-01 (Umbrella Dashboard canonical
 *     grammar — inherited at platform layer)
 *   - UX-G2-INV-001 V1.1 §3.14 OBL N-02 (Capability-deferred indicators
 *     across dashboard — Mode-D chip per card)
 *
 * Brand-neutral per PROPOSAL §11.A5. Used initially by WorkCaptain
 * dashboard; identical primitive will power Crédito / Società / S2PPRO /
 * VetiCare dashboards in subsequent waves.
 *
 * Variants (UX-001 §5.4):
 *   - count    — integer headcount, role count, etc.
 *   - currency — SAR amounts (Arabic-convention trailing symbol per L-04)
 *   - ratio    — percentages like Saudisation rate
 *   - status   — categorical status with semantic colour (green/amber/red)
 *   - trend    — value + delta + direction arrow (uses ConfidenceBand-
 *                style colour mapping for change direction)
 *
 * Mode-D framing per brief §4 + PROPOSAL §11.A2: every revenue-eligible
 * capability shows current Mode (A or D). Mode-D capabilities also show
 * the non-blocking advisory banner copy beneath the card via
 * renderModeDAdvisory.
 *
 * Empty-state per UX-001 §4.2 + brief §3.1: when value is null/undefined,
 * the card renders the empty-state copy explaining what should appear
 * here and the action to populate it.
 *
 * Usage:
 *   renderKpiCard({
 *     id: 'saudisation-rate',
 *     label: { en: 'Saudisation rate', ar: 'نسبة السعودة' },
 *     variant: 'ratio',
 *     value: 0.42,
 *     status: 'amber',
 *     trend: { delta: 0.02, direction: 'positive', period: '7d' },
 *     mode: 'D',
 *     emptyState: {
 *       title: { en: 'No data yet', ar: 'لا توجد بيانات بعد' },
 *       body:  { en: 'Add employees to see your Saudisation rate.', ar: 'أضف الموظفين لعرض نسبة السعودة.' },
 *       actionLabel: { en: 'Add employees', ar: 'إضافة موظفين' },
 *       actionHref:  '#workers',
 *     },
 *   })
 */

import { getLocale } from '../locale.js'
import { renderModeStatusChip } from './mode_status_chip.js'
import { renderSourceCitation } from './source_citation.js'

const TREND_GLYPH = { positive: '↑', negative: '↓', neutral: '→' }

const STATUS_TOKEN = {
  green:   { bg: 'var(--maq-semantic-success-bg)', fg: 'var(--maq-semantic-success)', label: { en: 'Healthy',  ar: 'سليم' } },
  amber:   { bg: 'var(--maq-semantic-warning-bg)', fg: 'var(--maq-semantic-warning)', label: { en: 'Watch',    ar: 'مراقبة' } },
  red:     { bg: 'var(--maq-semantic-danger-bg)',  fg: 'var(--maq-semantic-danger)',  label: { en: 'At risk',  ar: 'عرضة للخطر' } },
  unknown: { bg: 'var(--maq-neutral-100)',         fg: 'var(--maq-neutral-500)',      label: { en: 'No data',  ar: 'لا توجد بيانات' } },
}

/**
 * Format value per variant + locale.
 * @returns {{primary: string, secondary?: string}}
 */
function formatValue(value, variant, locale) {
  if (value === null || value === undefined) return { primary: '—' }

  if (variant === 'count') {
    const n = Number(value)
    return { primary: Number.isFinite(n) ? n.toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB') : '—' }
  }
  if (variant === 'currency') {
    const n = Number(value)
    if (!Number.isFinite(n)) return { primary: '—' }
    const formatted = n.toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB', { maximumFractionDigits: 0 })
    // Arabic-convention trailing currency symbol per L-04.
    return { primary: locale === 'ar' ? `${formatted} ﷼` : `SAR ${formatted}` }
  }
  if (variant === 'ratio') {
    const n = Number(value)
    if (!Number.isFinite(n)) return { primary: '—' }
    return { primary: `${Math.round(n * 100)}%` }
  }
  if (variant === 'status') {
    const key = String(value).toLowerCase()
    const tok = STATUS_TOKEN[key] || STATUS_TOKEN.unknown
    return { primary: tok.label[locale] || tok.label.en }
  }
  if (variant === 'trend') {
    const n = Number(value)
    if (!Number.isFinite(n)) return { primary: '—' }
    return { primary: n.toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB') }
  }
  return { primary: String(value) }
}

function resolveLocaleField(field, locale) {
  if (!field) return ''
  if (typeof field === 'string') return field
  if (typeof field === 'object') return field[locale] || field.en || ''
  return ''
}

/**
 * @param {object} opts
 * @returns {HTMLElement}
 */
export function renderKpiCard(opts = {}) {
  const locale = opts.locale || getLocale()
  const variant = ['count', 'currency', 'ratio', 'status', 'trend'].includes(opts.variant) ? opts.variant : 'count'
  const mode = opts.mode === 'A' ? 'A' : 'D'  // stricter default
  const labelText = resolveLocaleField(opts.label, locale)

  const card = document.createElement('article')
  card.setAttribute('data-component', 'kpi-card')
  card.setAttribute('data-variant', variant)
  card.setAttribute('data-mode', mode)
  if (opts.id) card.setAttribute('data-kpi-id', opts.id)
  card.setAttribute('role', 'group')
  card.setAttribute('aria-labelledby', `kpi-label-${opts.id || Math.random().toString(36).slice(2, 8)}`)
  card.style.cssText = [
    'background: var(--maq-neutral-0)',
    'border: 1px solid var(--maq-neutral-200)',
    'border-radius: var(--maq-radius-lg)',
    'padding: var(--maq-space-4)',
    'box-shadow: var(--maq-elevation-sm)',
    'display: flex',
    'flex-direction: column',
    'gap: var(--maq-space-3)',
    'min-block-size: 140px',
  ].join(';')

  // ── Header row: label + mode chip ──────────────────────────────────
  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:start;justify-content:space-between;gap:var(--maq-space-2)'

  const labelEl = document.createElement('h3')
  labelEl.id = card.getAttribute('aria-labelledby')
  labelEl.style.cssText = 'font-size:var(--maq-text-sm);font-weight:var(--maq-weight-medium);color:var(--maq-neutral-600);margin:0;text-transform:none'
  labelEl.textContent = labelText
  header.appendChild(labelEl)

  header.appendChild(renderModeStatusChip({ mode, capabilityName: opts.capabilityName || opts.id || '', locale }))
  card.appendChild(header)

  // ── Value display OR empty state ──────────────────────────────────
  const isEmpty = opts.value === null || opts.value === undefined
  if (isEmpty) {
    card.appendChild(renderEmptyState(opts.emptyState, locale))
  } else {
    card.appendChild(renderValue(opts, variant, locale))
  }

  // ── Trend line (variant=trend only) ────────────────────────────────
  if (variant === 'trend' && opts.trend && !isEmpty) {
    const tr = document.createElement('div')
    tr.style.cssText = 'display:flex;align-items:center;gap:var(--maq-space-2);font-size:var(--maq-text-sm)'
    const dir = opts.trend.direction || 'neutral'
    const glyph = document.createElement('span')
    glyph.setAttribute('aria-hidden', 'true')
    glyph.textContent = TREND_GLYPH[dir] || TREND_GLYPH.neutral
    glyph.style.cssText = 'font-weight:var(--maq-weight-bold);font-size:var(--maq-text-base);' +
      (dir === 'positive' ? 'color:var(--maq-semantic-success)' :
       dir === 'negative' ? 'color:var(--maq-semantic-danger)' :
                            'color:var(--maq-neutral-500)')
    tr.appendChild(glyph)
    const txt = document.createElement('span')
    txt.style.color = 'var(--maq-neutral-600)'
    const period = opts.trend.period || ''
    const deltaStr = typeof opts.trend.delta === 'number'
      ? (variant === 'ratio' ? `${(opts.trend.delta * 100).toFixed(1)}pp` : opts.trend.delta.toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB'))
      : ''
    txt.textContent = period ? `${deltaStr} ${period}` : deltaStr
    tr.appendChild(txt)
    card.appendChild(tr)
  }

  // ── Optional citation footer ───────────────────────────────────────
  if (opts.citation && !isEmpty) {
    const cite = renderSourceCitation({ ...opts.citation, locale })
    cite.style.alignSelf = 'flex-start'
    card.appendChild(cite)
  }

  // ── Mode-D capability-deferred indicator (UX-G2-INV-001 OBL N-02) ──
  if (mode === 'D') {
    const note = document.createElement('p')
    note.setAttribute('role', 'note')
    note.style.cssText = 'font-size:var(--maq-text-xs);color:var(--maq-mode-d);margin:0;line-height:var(--maq-leading-tight)'
    note.textContent = locale === 'ar'
      ? 'القدرة متاحة; لم يُفعَّل بعد لأحداث الإيرادات.'
      : 'Capability available; not yet activated for revenue events.'
    card.appendChild(note)
  }

  return card
}

function renderValue(opts, variant, locale) {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'display:flex;align-items:baseline;gap:var(--maq-space-2);flex-wrap:wrap'

  const formatted = formatValue(opts.value, variant, locale)

  const v = document.createElement('span')
  v.style.cssText = 'font-size:var(--maq-text-3xl);font-weight:var(--maq-weight-bold);color:var(--maq-neutral-900);line-height:var(--maq-leading-tight);font-family:var(--maq-font-arabic),var(--maq-font-latin)'

  if (variant === 'status') {
    // Status variant: pill with semantic colour, not big number.
    const key = String(opts.value || opts.status || '').toLowerCase()
    const tok = STATUS_TOKEN[key] || STATUS_TOKEN.unknown
    const pill = document.createElement('span')
    pill.setAttribute('role', 'status')
    pill.textContent = tok.label[locale] || tok.label.en
    pill.style.cssText = [
      'display: inline-flex',
      'align-items: center',
      'padding-inline: var(--maq-space-3)',
      'padding-block: var(--maq-space-2)',
      'background: ' + tok.bg,
      'color: ' + tok.fg,
      'border-radius: var(--maq-radius-md)',
      'font-size: var(--maq-text-lg)',
      'font-weight: var(--maq-weight-semibold)',
    ].join(';')
    wrap.appendChild(pill)
  } else {
    v.textContent = formatted.primary
    wrap.appendChild(v)
  }

  if (opts.unit && variant !== 'status') {
    const u = document.createElement('span')
    u.style.cssText = 'font-size:var(--maq-text-sm);color:var(--maq-neutral-500)'
    u.textContent = resolveLocaleField(opts.unit, locale)
    wrap.appendChild(u)
  }

  return wrap
}

function renderEmptyState(empty, locale) {
  const wrap = document.createElement('div')
  wrap.setAttribute('role', 'note')
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--maq-space-2);padding-block:var(--maq-space-2)'

  if (!empty) {
    const txt = document.createElement('p')
    txt.style.cssText = 'margin:0;font-size:var(--maq-text-sm);color:var(--maq-neutral-500);font-style:italic'
    txt.textContent = locale === 'ar' ? 'لا توجد بيانات بعد.' : 'No data yet.'
    wrap.appendChild(txt)
    return wrap
  }

  const title = document.createElement('p')
  title.style.cssText = 'margin:0;font-size:var(--maq-text-base);font-weight:var(--maq-weight-semibold);color:var(--maq-neutral-800)'
  title.textContent = resolveLocaleField(empty.title, locale)
  wrap.appendChild(title)

  const body = document.createElement('p')
  body.style.cssText = 'margin:0;font-size:var(--maq-text-sm);color:var(--maq-neutral-600);line-height:var(--maq-leading-relaxed)'
  body.textContent = resolveLocaleField(empty.body, locale)
  wrap.appendChild(body)

  if (empty.actionLabel && empty.actionHref) {
    const a = document.createElement('a')
    a.href = empty.actionHref
    a.textContent = resolveLocaleField(empty.actionLabel, locale)
    a.style.cssText = 'color:var(--maq-brand-primary);text-decoration:underline;font-size:var(--maq-text-sm);font-weight:var(--maq-weight-medium);align-self:flex-start'
    wrap.appendChild(a)
  }

  return wrap
}

export default renderKpiCard
