/*
 * Hero — landing-page hero section
 *
 * Authority: brief §1 — "what WorkCaptain does in one sentence covering
 * Saudisation (Nitaqat), Payroll, Workforce Analytics, GOSI, Mudad, Qiwa
 * integrations via licensed partners."
 *
 * Brand-neutral per PROPOSAL §11.A5: receives `brand` config + `locale`
 * as input; no WC-specific copy hard-coded inside the component.
 *
 * Controlled-beta posture per brief §1: "Request access" CTA — NOT "Sign
 * up free". Sponsor B1(b) WC Controlled-Launch Memo V1.1 binding.
 *
 * Accessibility:
 *   - <section> with aria-labelledby pointing to <h1>
 *   - Heading hierarchy: <h1> is the page H1
 *   - CTA buttons have descriptive aria-labels in both locales
 *   - 30-second-rule (PROPOSAL §11.A3 step ii): hero text is the
 *     "what" the user must understand in <30s
 */

import { t, getLocale } from '../locale.js'

/**
 * @param {object} opts
 * @param {object} opts.brand   — brand variant from src/brand/index.js
 * @param {string} [opts.locale]
 * @param {Function} [opts.onRequestAccess]  — CTA click handler
 * @param {Function} [opts.onSignIn]         — CTA click handler
 * @returns {HTMLElement}
 */
export function renderHero(opts = {}) {
  const brand = opts.brand
  const locale = opts.locale || getLocale()

  const section = document.createElement('section')
  section.setAttribute('data-component', 'hero')
  section.setAttribute('id', 'main-content')
  section.setAttribute('aria-labelledby', 'hero-heading')
  section.className = 'wc-hero'

  const inner = document.createElement('div')
  inner.className = 'wc-hero__inner'

  // ── Brand wordmark + tagline ────────────────────────────────────────
  const eyebrow = document.createElement('p')
  eyebrow.className = 'wc-hero__eyebrow'
  eyebrow.textContent = brand && brand.publicName ? (brand.publicName[locale] || brand.publicName.en) : 'WorkCaptain'
  inner.appendChild(eyebrow)

  // ── H1 ──────────────────────────────────────────────────────────────
  const h1 = document.createElement('h1')
  h1.id = 'hero-heading'
  h1.className = 'wc-hero__title'
  h1.textContent = locale === 'ar'
    ? 'دعم قرارات القوى العاملة في المملكة — السعودة، الرواتب، والامتثال.'
    : 'Saudi workforce decision-support — Saudisation, Payroll, and Compliance.'
  inner.appendChild(h1)

  // ── Lede sentence (the 30-second-rule sentence) ─────────────────────
  const lede = document.createElement('p')
  lede.className = 'wc-hero__lede'
  lede.textContent = locale === 'ar'
    ? 'وورك كابتن يساعد أصحاب العمل في المملكة على إدارة السعودة (نطاقات)، والرواتب، وتحليلات القوى العاملة، والتكامل مع التأمينات (GOSI)، ومُدد، وقوى — عبر شركاء مرخّصين.'
    : 'WorkCaptain helps Saudi employers manage Saudisation (Nitaqat), Payroll, Workforce Analytics, and integrations with GOSI, Mudad, and Qiwa — through licensed partners.'
  inner.appendChild(lede)

  // ── CTAs ────────────────────────────────────────────────────────────
  const ctas = document.createElement('div')
  ctas.className = 'wc-hero__ctas'

  const primaryCta = document.createElement('button')
  primaryCta.type = 'button'
  primaryCta.className = 'wc-btn wc-btn--primary'
  primaryCta.textContent = (brand && brand.copy && brand.copy.requestAccessCta && brand.copy.requestAccessCta[locale])
    || (locale === 'ar' ? 'طلب الوصول' : 'Request access')
  primaryCta.setAttribute('aria-label', locale === 'ar'
    ? 'طلب الوصول إلى المرحلة التجريبية المُدارة'
    : 'Request controlled-beta access')
  if (typeof opts.onRequestAccess === 'function') {
    primaryCta.addEventListener('click', opts.onRequestAccess)
  }
  ctas.appendChild(primaryCta)

  const secondaryCta = document.createElement('button')
  secondaryCta.type = 'button'
  secondaryCta.className = 'wc-btn wc-btn--secondary'
  secondaryCta.textContent = (brand && brand.copy && brand.copy.signInCta && brand.copy.signInCta[locale])
    || (locale === 'ar' ? 'تسجيل الدخول' : 'Sign in')
  secondaryCta.setAttribute('aria-label', locale === 'ar'
    ? 'تسجيل الدخول لأعضاء المرحلة التجريبية'
    : 'Sign in (invited cohort members only)')
  if (typeof opts.onSignIn === 'function') {
    secondaryCta.addEventListener('click', opts.onSignIn)
  }
  ctas.appendChild(secondaryCta)

  inner.appendChild(ctas)

  // ── Cohort-only fine print ─────────────────────────────────────────
  const finePrint = document.createElement('p')
  finePrint.className = 'wc-hero__fine-print'
  finePrint.textContent = locale === 'ar'
    ? 'تسجيل الدخول مُتاح لأعضاء المرحلة التجريبية بالدعوة فقط.'
    : 'Sign-in available to invited cohort members only.'
  inner.appendChild(finePrint)

  section.appendChild(inner)
  return section
}

export default renderHero
