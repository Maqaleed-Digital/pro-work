/*
 * PricingOutline — indicative tier outline (NO PAYMENT COLLECTION)
 *
 * Authority:
 *   - brief §1: "Pricing tier outline: SMB (S) / Mid-market (T) /
 *     Government (G). Indicative only — no payment collection during
 *     controlled beta."
 *   - MPP-RM-001 §10.1 (Mode-D categorical-prohibition): outputs are
 *     advisory only; not contracted, not invoiced, not recognised,
 *     not reported. No checkout affordances rendered.
 *   - WC Controlled-Launch Memo V1.1 (Sponsor B1(b)): no Mode-D revenue
 *     collection through UI.
 *
 * Tier names per brief: SMB (S), Mid-market (T), Government (G).
 * Note: the brief's tier letters (S/T/G) appear to be aspirational
 * shorthand. Treated as indicative labels; no payment integration
 * scaffold rendered (per stricter rule).
 *
 * Brand-neutral per PROPOSAL §11.A5.
 */

import { getLocale } from '../locale.js'

/**
 * @param {object} opts
 * @param {string} [opts.locale]
 * @returns {HTMLElement}
 */
export function renderPricingOutline(opts = {}) {
  const locale = opts.locale || getLocale()

  const section = document.createElement('section')
  section.setAttribute('data-component', 'pricing-outline')
  section.setAttribute('aria-labelledby', 'pricing-heading')
  section.className = 'wc-pricing'

  const heading = document.createElement('h2')
  heading.id = 'pricing-heading'
  heading.className = 'wc-pricing__heading'
  heading.textContent = locale === 'ar' ? 'الفئات الاسترشادية' : 'Indicative tiers'
  section.appendChild(heading)

  // Mode-D framed disclaimer — REQUIRED per RM-001 §10.1
  const disclaimer = document.createElement('p')
  disclaimer.className = 'wc-pricing__disclaimer'
  disclaimer.setAttribute('role', 'note')
  disclaimer.textContent = locale === 'ar'
    ? 'الأسعار في المرحلة التجريبية استرشادية. الأسعار النهائية تُطبَّق بعد التفعيل. لا يُجمع أي مبلغ خلال المرحلة التجريبية.'
    : 'Pricing in this evaluation phase is indicative; final pricing applies post-activation. No payment is collected during the controlled beta.'
  section.appendChild(disclaimer)

  const tiers = [
    {
      key: 'S',
      name: { en: 'SMB', ar: 'الشركات الصغيرة والمتوسطة' },
      audience: { en: 'Up to ~100 employees', ar: 'حتى ~100 موظف' },
      capabilities: { en: ['WC-SAUD', 'WC-PYR (read-only beta)', 'WC-REC'], ar: ['WC-SAUD', 'WC-PYR (قراءة فقط في المرحلة التجريبية)', 'WC-REC'] },
    },
    {
      key: 'T',
      name: { en: 'Mid-market', ar: 'الشركات المتوسطة الكبيرة' },
      audience: { en: '~100–1,000 employees', ar: '~100–1,000 موظف' },
      capabilities: { en: ['WC-SAUD', 'WC-PYR', 'WC-WFA', 'WC-REC'], ar: ['WC-SAUD', 'WC-PYR', 'WC-WFA', 'WC-REC'] },
    },
    {
      key: 'G',
      name: { en: 'Government', ar: 'القطاع الحكومي' },
      audience: { en: 'Government entities, large enterprises', ar: 'الجهات الحكومية، المؤسسات الكبرى' },
      capabilities: { en: ['Full stack', 'WC-B2G (informational)'], ar: ['الحزمة الكاملة', 'WC-B2G (معلومات فقط)'] },
    },
  ]

  const grid = document.createElement('div')
  grid.className = 'wc-pricing__grid'
  grid.setAttribute('role', 'list')

  for (const tier of tiers) {
    const card = document.createElement('article')
    card.setAttribute('role', 'listitem')
    card.setAttribute('data-component', 'pricing-card')
    card.setAttribute('data-tier', tier.key)
    card.className = 'wc-pricing-card'

    const keyEl = document.createElement('p')
    keyEl.className = 'wc-pricing-card__key'
    keyEl.textContent = `(${tier.key})`
    card.appendChild(keyEl)

    const nameEl = document.createElement('h3')
    nameEl.className = 'wc-pricing-card__name'
    nameEl.textContent = tier.name[locale] || tier.name.en
    card.appendChild(nameEl)

    const audEl = document.createElement('p')
    audEl.className = 'wc-pricing-card__audience'
    audEl.textContent = tier.audience[locale] || tier.audience.en
    card.appendChild(audEl)

    const ul = document.createElement('ul')
    ul.className = 'wc-pricing-card__caps'
    for (const cap of (tier.capabilities[locale] || tier.capabilities.en)) {
      const li = document.createElement('li')
      li.textContent = cap
      ul.appendChild(li)
    }
    card.appendChild(ul)

    // Explicit no-checkout: NO buttons, NO payment selectors on Mode-D tiers.
    // Per PROPOSAL §11.A4 feature-to-UI parity gate: no phantom checkout.

    grid.appendChild(card)
  }

  section.appendChild(grid)
  return section
}

export default renderPricingOutline
