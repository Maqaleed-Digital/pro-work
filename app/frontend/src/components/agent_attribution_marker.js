/*
 * AgentAttributionMarker
 *
 * Authority:
 *   - MPP-UX-001 §7.7 (Agent attribution chip — non-removable, bilingual,
 *     cross-surface persistent)
 *   - MPP-MA-001 V1.1.1 §2.2.3 + §2.4 (agent triad: explainable, auditable,
 *     attributable; orphaned outputs prohibited)
 *   - UX-G2 V1.1 §6 (component contract: aria-label is the bilingual
 *     disclosure string; marker is never visually hidden; persists across
 *     keyboard tab order)
 *   - UX-G2-INV-001 V1.1 §3.3 OBL C-01 (covered status)
 *
 * Stricter-interpretation default (PROPOSAL §11.A2): if `agent` is
 * missing required fields, the marker still renders with an "Unattributed
 * agent output" label and a fallback aria-label rather than being hidden.
 * The Three Hard Guardrails (MA-001 §3 Invariant 2) require visible
 * attribution under all conditions — silence is not permitted.
 *
 * Brand-neutral per PROPOSAL §11.A5: receives `agent` config + `locale`
 * as input; reuses canonical --maq-* tokens; transplants to Crédito /
 * Società / S2PPRO / VetiCare without WC-specific code paths.
 *
 * Variants per UX-G2 V1.1 §6.1:
 *   - inline (default): adjacent to value within a sentence/field
 *   - block:           top/bottom of agent-originated content region
 *   - badge:           compact for lists/tables
 *
 * Usage:
 *   import { renderAgentAttributionMarker } from './agent_attribution_marker.js'
 *   const marker = renderAgentAttributionMarker({
 *     agent: {
 *       name: 'WorkCaptain Saudisation Advisor',
 *       class: 'platform-scoped',          // platform-scoped | cross-platform | regulator-facing | internal-operations
 *       version: 'v1.0.0',
 *       hitlStatus: 'pending',              // pending | confirmed | overridden | null
 *     },
 *     locale: 'en',                          // optional; defaults to getLocale()
 *     variant: 'inline',                     // inline | block | badge
 *   })
 */

import { t, getLocale } from '../locale.js'

const FALLBACK_LABEL = {
  en: 'Unattributed agent output',
  ar: 'مخرج وكيل غير منسوب',
}
const PREFIX_LABEL = {
  en: 'AI-generated',
  ar: 'تم توليده بواسطة الذكاء الاصطناعي',
}

/**
 * @param {object} opts
 * @param {object} opts.agent
 * @param {string} [opts.agent.name]
 * @param {string} [opts.agent.class]
 * @param {string} [opts.agent.version]
 * @param {'pending'|'confirmed'|'overridden'|null} [opts.agent.hitlStatus]
 * @param {'inline'|'block'|'badge'} [opts.variant='inline']
 * @param {string} [opts.locale]
 * @returns {HTMLElement}
 */
export function renderAgentAttributionMarker(opts = {}) {
  const locale = opts.locale || getLocale()
  const variant = ['inline', 'block', 'badge'].includes(opts.variant) ? opts.variant : 'inline'
  const agent = (opts.agent && typeof opts.agent === 'object') ? opts.agent : {}

  const name = String(agent.name || '').trim()
  const agentClass = String(agent.class || '').trim()
  const version = String(agent.version || '').trim()
  const hitlStatus = ['pending', 'confirmed', 'overridden'].includes(agent.hitlStatus) ? agent.hitlStatus : null

  // ── Build bilingual disclosure label ────────────────────────────────
  const visibleLabel = name
    ? `${PREFIX_LABEL[locale]} · ${name}`
    : FALLBACK_LABEL[locale]
  const ariaParts = [
    name ? `${PREFIX_LABEL.en} · ${name}` : FALLBACK_LABEL.en,
    name ? `${PREFIX_LABEL.ar} · ${name}` : FALLBACK_LABEL.ar,
  ]
  if (agentClass) ariaParts.push(`Class: ${agentClass}`)
  if (version) ariaParts.push(`Version: ${version}`)
  if (hitlStatus) ariaParts.push(`HITL: ${hitlStatus}`)
  const ariaLabel = ariaParts.join('. ')

  const el = document.createElement('span')
  el.setAttribute('data-component', 'agent-attribution-marker')
  el.setAttribute('data-variant', variant)
  el.setAttribute('data-hitl-status', hitlStatus || 'none')
  el.setAttribute('role', 'note')
  el.setAttribute('aria-label', ariaLabel)
  // Never hidden — Three Hard Guardrails require visible attribution.
  el.setAttribute('aria-hidden', 'false')

  const baseStyle = [
    'font-family: var(--maq-font-arabic), var(--maq-font-latin)',
    'font-size: var(--maq-text-xs)',
    'color: var(--maq-agent-attributed)',
    'background: var(--maq-agent-attributed-bg)',
    'border-radius: var(--maq-radius-sm)',
    'line-height: var(--maq-leading-tight)',
    'border: 1px solid var(--maq-agent-attributed)',
  ]

  if (variant === 'inline') {
    baseStyle.push(
      'display: inline-flex',
      'align-items: center',
      'gap: var(--maq-space-1)',
      'padding-inline: var(--maq-space-2)',
      'padding-block: 2px',
      'margin-inline-start: var(--maq-space-2)',
    )
  } else if (variant === 'block') {
    baseStyle.push(
      'display: flex',
      'align-items: center',
      'gap: var(--maq-space-2)',
      'padding-inline: var(--maq-space-3)',
      'padding-block: var(--maq-space-2)',
      'margin-block-end: var(--maq-space-2)',
      'inline-size: fit-content',
    )
  } else { // badge
    baseStyle.push(
      'display: inline-block',
      'padding-inline: var(--maq-space-2)',
      'padding-block: 1px',
      'font-weight: var(--maq-weight-medium)',
    )
  }
  el.style.cssText = baseStyle.join(';')

  // Decorative icon — meaning is in text + aria-label per UX-G2 §6.4
  const icon = document.createElement('span')
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = '◇'
  icon.style.cssText = 'font-size:0.85em;line-height:1'
  el.appendChild(icon)

  // Visible text
  const textEl = document.createElement('span')
  textEl.textContent = visibleLabel
  el.appendChild(textEl)

  // Version chip (UX-001 §7.7 — version visible on hover/tap; here always
  // visible as compact suffix to satisfy "discoverable" requirement)
  if (version && variant !== 'badge') {
    const ver = document.createElement('span')
    ver.style.cssText = 'opacity:0.7;font-family:var(--maq-font-mono);font-size:0.85em;margin-inline-start:var(--maq-space-1)'
    ver.textContent = version
    el.appendChild(ver)
  }

  // HITL status badge (UX-G2-INV-001 V1.1 §3.3 OBL C-08)
  if (hitlStatus && variant !== 'badge') {
    const hitl = document.createElement('span')
    const hitlLabels = {
      pending:    { en: 'HITL pending',    ar: 'بانتظار المراجعة البشرية' },
      confirmed:  { en: 'HITL confirmed',  ar: 'مُؤكَّد بشريًا' },
      overridden: { en: 'HITL overridden', ar: 'تم التجاوز' },
    }
    hitl.textContent = hitlLabels[hitlStatus][locale] || hitlLabels[hitlStatus].en
    hitl.style.cssText = [
      'margin-inline-start: var(--maq-space-2)',
      'padding-inline: var(--maq-space-2)',
      'padding-block: 1px',
      'border-radius: var(--maq-radius-sm)',
      'background: var(--maq-hitl-pending)',
      'color: var(--maq-neutral-0)',
      'font-size: 0.85em',
      'font-weight: var(--maq-weight-medium)',
    ].join(';')
    el.appendChild(hitl)
  }

  return el
}

export default renderAgentAttributionMarker
