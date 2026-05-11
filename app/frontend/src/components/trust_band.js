/*
 * TrustBand — trust posture strip
 *
 * Authority: brief §1 — "Trust band: PDPL-compliant, KSA data residency
 * (me-central2), SAMA-aware / NCA-ECC-aware posture."
 *
 * Endorsement-disclaimer guarded per UX-G2 V1.1 §7.1 A5 amendment: this
 * component renders attribution as INFORMATIONAL only. No SAMA or NCA
 * endorsement is implied. Sponsor B1(b) brief explicitly says "aware" —
 * the brand config (brand.trustBand.samaPosture / .ncaEccPosture) carries
 * 'aware', not 'licensed' or 'certified'.
 *
 * Brand-neutral per §11.A5: consumes brand.trustBand object; nothing
 * WC-specific lives in this component.
 */

import { getLocale } from '../locale.js'

/**
 * @param {object} opts
 * @param {object} opts.brand
 * @param {string} [opts.locale]
 * @returns {HTMLElement}
 */
export function renderTrustBand(opts = {}) {
  const brand = opts.brand
  const locale = opts.locale || getLocale()
  const tb = (brand && brand.trustBand) || {}

  const section = document.createElement('section')
  section.setAttribute('data-component', 'trust-band')
  section.setAttribute('aria-label', locale === 'ar' ? 'موقف الثقة والامتثال' : 'Trust and compliance posture')
  section.className = 'wc-trust'

  const items = []

  if (tb.pdpl) {
    items.push({
      icon: '🛡',
      label: locale === 'ar' ? 'متوافق مع نظام حماية البيانات الشخصية' : 'PDPL-compliant',
    })
  }
  if (tb.residency === 'me-central2-ksa') {
    items.push({
      icon: '📍',
      label: locale === 'ar'
        ? 'البيانات مُخزَّنة في المملكة العربية السعودية (الدمام)'
        : 'Data stored in Saudi Arabia (me-central2 / Dammam)',
    })
  }
  if (tb.samaPosture === 'aware') {
    items.push({
      icon: '🏦',
      label: locale === 'ar' ? 'موقف مُدرك لإطار البنك المركزي السعودي' : 'SAMA-aware posture',
    })
  }
  if (tb.ncaEccPosture === 'aware') {
    items.push({
      icon: '🔒',
      label: locale === 'ar' ? 'موقف مُدرك لإطار الهيئة الوطنية للأمن السيبراني (ECC)' : 'NCA ECC-aware posture',
    })
  }

  const list = document.createElement('ul')
  list.className = 'wc-trust__list'
  list.setAttribute('role', 'list')

  for (const item of items) {
    const li = document.createElement('li')
    li.className = 'wc-trust__item'

    const icon = document.createElement('span')
    icon.setAttribute('aria-hidden', 'true')
    icon.className = 'wc-trust__icon'
    icon.textContent = item.icon

    const label = document.createElement('span')
    label.className = 'wc-trust__label'
    label.textContent = item.label

    li.appendChild(icon)
    li.appendChild(label)
    list.appendChild(li)
  }

  section.appendChild(list)

  // Endorsement disclaimer (UX-G2 V1.1 §7.1 A5)
  const disclaimer = document.createElement('p')
  disclaimer.className = 'wc-trust__disclaimer'
  disclaimer.textContent = locale === 'ar'
    ? 'بيانات الموقف أعلاه استرشادية. لا تعني تأييدًا أو ترخيصًا من البنك المركزي السعودي أو الهيئة الوطنية للأمن السيبراني إلا حيث يُوثَّق ذلك صراحةً في سجل الحوكمة.'
    : 'Posture statements above are informational. They do not imply endorsement or licensing by SAMA or the NCA unless explicitly recorded in the governance register.'
  section.appendChild(disclaimer)

  return section
}

export default renderTrustBand
