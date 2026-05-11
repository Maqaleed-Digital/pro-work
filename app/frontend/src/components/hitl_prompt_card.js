/*
 * HITLPromptCard
 *
 * Authority:
 *   - MPP-UX-001 §7.4 (HITL with confidence-below-threshold auto-surface)
 *   - UX-G2 V1.1 §5.3 (HITL treatment — explicit Confirm/Reject; no
 *     implicit confirmation path)
 *   - MPP-MA-001 V1.1 §3 Invariant 2 (Three Hard Guardrails — no
 *     autonomous regulated execution; no policy-state modification; no
 *     activation of deferred capabilities)
 *   - UX-G2-INV-001 V1.1 §3.3 OBL C-06 (Override paths discoverable —
 *     reject / modify / escalate)
 *
 * Stricter rule (PROPOSAL §11.A2):
 *   - DEFAULT for Escape, click-outside, Cancel: non-destructive REJECT
 *     (never silent approve). Auto-confirmation paths are FORBIDDEN.
 *   - Approve button requires explicit click; no Enter-key-on-card
 *     auto-approval.
 *   - Modify path is a discoverable affordance per UX-G2-INV-001 OBL C-06;
 *     consumer supplies onModify handler when applicable.
 *
 * Audit emission contract (per UX-G2 V1.1 §5.3): every Approve / Reject /
 * Modify decision returns a structured payload to the consumer's
 * onDecision callback so the consumer's audit-logging substrate captures
 * the eight-attribute VERITAS event (action id, timestamp, user id,
 * agent attribution, outcome, rationale, correlation_id, ip).
 *
 * Brand-neutral per §11.A5.
 *
 * Usage:
 *   renderHITLPromptCard({
 *     prompt: {
 *       title: 'Approve Saudisation move recommendation?',
 *       body:  'Suggest moving role X from non-Saudi to Saudi to maintain Green zone.',
 *     },
 *     agent: { name: 'WC Saudisation Advisor', version: 'v1.0.0' },
 *     onDecision: ({ decision, rationale }) => { ... },     // 'approve'|'reject'|'modify'
 *     requireRationale: { approve: false, reject: true, modify: true },
 *   })
 */

import { t, getLocale } from '../locale.js'
import { renderAgentAttributionMarker } from './agent_attribution_marker.js'

/**
 * @param {object} opts
 * @param {object} opts.prompt
 * @param {object|{en:string,ar:string}} opts.prompt.title
 * @param {object|{en:string,ar:string}} opts.prompt.body
 * @param {object} [opts.agent]
 * @param {Function} opts.onDecision
 * @param {object} [opts.requireRationale]
 * @param {string} [opts.locale]
 * @returns {HTMLElement}
 */
export function renderHITLPromptCard(opts = {}) {
  const locale = opts.locale || getLocale()
  const prompt = opts.prompt || {}
  const requireRationale = Object.assign(
    { approve: false, reject: true, modify: true },
    opts.requireRationale || {}
  )

  function resolve(field) {
    if (!field) return ''
    if (typeof field === 'string') return field
    if (typeof field === 'object') return field[locale] || field.en || ''
    return ''
  }

  const card = document.createElement('section')
  card.setAttribute('data-component', 'hitl-prompt-card')
  card.setAttribute('role', 'region')
  card.setAttribute('aria-labelledby', 'hitl-title-' + Math.random().toString(36).slice(2, 8))
  card.style.cssText = [
    'background: var(--maq-neutral-0)',
    'border: 2px solid var(--maq-hitl-pending)',
    'border-radius: var(--maq-radius-lg)',
    'padding: var(--maq-space-4)',
    'margin-block: var(--maq-space-4)',
    'box-shadow: var(--maq-elevation-md)',
  ].join(';')

  // ── Header: agent attribution + HITL pending tag ─────────────────
  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:var(--maq-space-3);margin-block-end:var(--maq-space-3);flex-wrap:wrap'

  if (opts.agent) {
    header.appendChild(renderAgentAttributionMarker({
      agent: { ...opts.agent, hitlStatus: 'pending' },
      variant: 'block',
      locale,
    }))
  }

  const guardrailBadge = document.createElement('span')
  guardrailBadge.setAttribute('aria-label', locale === 'ar'
    ? 'موافقة بشرية مطلوبة — لا تنفيذ ذاتي'
    : 'Human approval required — no autonomous execution')
  guardrailBadge.textContent = locale === 'ar' ? '🛡 HITL' : '🛡 HITL'
  guardrailBadge.style.cssText = [
    'display: inline-flex',
    'align-items: center',
    'gap: var(--maq-space-1)',
    'padding-inline: var(--maq-space-2)',
    'padding-block: 2px',
    'background: var(--maq-hitl-pending)',
    'color: var(--maq-neutral-0)',
    'border-radius: var(--maq-radius-sm)',
    'font-size: var(--maq-text-xs)',
    'font-weight: var(--maq-weight-semibold)',
    'letter-spacing: var(--maq-tracking-wide)',
  ].join(';')
  header.appendChild(guardrailBadge)

  card.appendChild(header)

  // ── Title ──────────────────────────────────────────────────────────
  const titleId = card.getAttribute('aria-labelledby')
  const title = document.createElement('h3')
  title.id = titleId
  title.style.cssText = 'font-size:var(--maq-text-lg);font-weight:var(--maq-weight-semibold);color:var(--maq-neutral-900);margin:0 0 var(--maq-space-2);line-height:var(--maq-leading-tight)'
  title.textContent = resolve(prompt.title)
  card.appendChild(title)

  // ── Body ───────────────────────────────────────────────────────────
  if (prompt.body) {
    const body = document.createElement('p')
    body.style.cssText = 'font-size:var(--maq-text-sm);color:var(--maq-neutral-700);margin:0 0 var(--maq-space-4);line-height:var(--maq-leading-relaxed)'
    body.textContent = resolve(prompt.body)
    card.appendChild(body)
  }

  // ── Children slot (for ExplainabilityBundle, ConfidenceBand, etc.) ─
  if (opts.children instanceof HTMLElement) {
    card.appendChild(opts.children)
  } else if (Array.isArray(opts.children)) {
    for (const c of opts.children) {
      if (c instanceof HTMLElement) card.appendChild(c)
    }
  }

  // ── Optional rationale field ──────────────────────────────────────
  const rationaleWrap = document.createElement('div')
  rationaleWrap.style.cssText = 'margin-block:var(--maq-space-3);display:none'
  const rationaleLabel = document.createElement('label')
  rationaleLabel.htmlFor = 'hitl-rationale-' + titleId
  rationaleLabel.textContent = locale === 'ar' ? 'السبب (مطلوب)' : 'Rationale (required)'
  rationaleLabel.style.cssText = 'display:block;font-size:var(--maq-text-sm);font-weight:var(--maq-weight-medium);margin-block-end:var(--maq-space-1)'
  const rationaleInput = document.createElement('textarea')
  rationaleInput.id = 'hitl-rationale-' + titleId
  rationaleInput.rows = 3
  rationaleInput.style.cssText = 'inline-size:100%;padding:var(--maq-space-2);border:1px solid var(--maq-neutral-300);border-radius:var(--maq-radius-md);font-family:inherit;font-size:var(--maq-text-sm);resize:vertical'
  rationaleInput.placeholder = locale === 'ar'
    ? 'اشرح السبب (10 أحرف على الأقل) …'
    : 'Explain your decision (minimum 10 characters) …'
  rationaleWrap.appendChild(rationaleLabel)
  rationaleWrap.appendChild(rationaleInput)
  card.appendChild(rationaleWrap)

  const errEl = document.createElement('p')
  errEl.setAttribute('role', 'alert')
  errEl.setAttribute('aria-live', 'polite')
  errEl.style.cssText = 'color:var(--maq-semantic-danger);font-size:var(--maq-text-sm);margin:var(--maq-space-2) 0;min-height:1em'
  card.appendChild(errEl)

  // ── Action row: Approve | Modify | Reject ─────────────────────────
  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;gap:var(--maq-space-3);flex-wrap:wrap;margin-block-start:var(--maq-space-3)'

  let pendingDecision = null

  function setRationaleVisible(visible) {
    rationaleWrap.style.display = visible ? 'block' : 'none'
    if (visible) {
      rationaleInput.focus()
    }
  }

  function emit(decision, opts2 = {}) {
    const rationale = rationaleInput.value.trim()
    const needsRationale = !!requireRationale[decision]
    if (needsRationale && rationale.length < 10) {
      errEl.textContent = locale === 'ar'
        ? 'يرجى إدخال سبب لا يقل عن 10 أحرف.'
        : 'Please enter a rationale of at least 10 characters.'
      setRationaleVisible(true)
      pendingDecision = decision
      return
    }
    errEl.textContent = ''
    if (typeof opts.onDecision === 'function') {
      opts.onDecision({
        decision,
        rationale: rationale || null,
        timestamp: new Date().toISOString(),
        ...(opts2 || {}),
      })
    }
  }

  function makeBtn(label, decision, variant) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.setAttribute('data-decision', decision)
    const styles = [
      'min-height: 44px',
      'padding-inline: var(--maq-space-5, var(--maq-space-4))',
      'padding-block: var(--maq-space-2)',
      'border-radius: var(--maq-radius-md)',
      'font-family: inherit',
      'font-size: var(--maq-text-sm)',
      'font-weight: var(--maq-weight-semibold)',
      'cursor: pointer',
      'border: 1px solid transparent',
      'transition: var(--transition-fast)',
    ]
    if (variant === 'approve') {
      styles.push('background: var(--maq-semantic-success)', 'color: var(--maq-semantic-on-success)')
    } else if (variant === 'reject') {
      styles.push('background: transparent', 'color: var(--maq-semantic-danger)', 'border-color: var(--maq-semantic-danger)')
    } else { // modify
      styles.push('background: transparent', 'color: var(--maq-brand-primary)', 'border-color: var(--maq-neutral-300)')
    }
    b.style.cssText = styles.join(';')
    b.addEventListener('click', () => {
      // If rationale required and not yet visible, show it first; user
      // clicks the button a second time to confirm. Prevents accidental
      // submission and satisfies "no auto-confirmation" rule.
      const needsRationale = !!requireRationale[decision]
      if (needsRationale && rationaleWrap.style.display === 'none') {
        pendingDecision = decision
        setRationaleVisible(true)
        return
      }
      emit(decision)
    })
    return b
  }

  const approveBtn = makeBtn(locale === 'ar' ? 'موافقة' : 'Approve', 'approve', 'approve')
  actions.appendChild(approveBtn)

  if (typeof opts.onModify === 'function' || requireRationale.modify !== undefined) {
    const modifyBtn = makeBtn(locale === 'ar' ? 'تعديل' : 'Modify', 'modify', 'modify')
    actions.appendChild(modifyBtn)
  }

  const rejectBtn = makeBtn(locale === 'ar' ? 'رفض' : 'Reject', 'reject', 'reject')
  actions.appendChild(rejectBtn)

  card.appendChild(actions)

  // ── Keyboard: Escape defaults to non-destructive Reject (UX-G2 §5.3) ─
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      // Per stricter rule: Escape is non-destructive — fires Reject with
      // a system-supplied rationale. Consumer can opt out via requireRationale
      // override.
      if (requireRationale.reject && rationaleInput.value.trim().length < 10) {
        rationaleInput.value = locale === 'ar'
          ? 'تم الإلغاء بواسطة المستخدم (مفتاح Escape).'
          : 'Cancelled by user (Escape key).'
      }
      emit('reject')
    }
  })

  return card
}

export default renderHITLPromptCard
