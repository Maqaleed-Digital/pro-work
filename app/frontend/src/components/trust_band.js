/*
 * TrustBand — trust posture strip
 *
 * Authority: brief §1 — "Trust band: PDPL-compliant, KSA data residency
 *  (me-central2), SAMA-aware / NCA-ECC-aware posture."
 *
 * Day 7 fix #4 (2026-05-16 — Finding 3, HR-calibrated band):
 *   Sponsor walkthrough: SAMA-aware (banking) and NCA ECC-aware (cyber-
 *   security generic) framings are weak signals on an HR landing surface.
 *   They've been REMOVED from this band. The honest disclosure of what
 *   we DO NOT claim about SAMA/NCA lives now exclusively in the Trust
 *   hub's Residency surface (pages/trust.js renderResidency, locale
 *   keys trust.residency.limit1/2/3). That's the right audience.
 *
 *   Replaced with two HR-calibrated items:
 *     🤝 HRSD / Qiwa / GOSI integration via licensed partners
 *     📜 Full audit trail, consent, data export visible to admin
 *
 *   brand.trustBand.samaPosture / .ncaEccPosture fields are no longer
 *   consumed here but remain in brand config for backward compat — if
 *   any future surface wants to render them, they can.
 *
 * Endorsement-disclaimer guarded per UX-G2 V1.1 §7.1 A5 amendment: this
 * component renders attribution as INFORMATIONAL only.
 *
 * Brand-neutral per §11.A5: tb.pdpl + tb.residency drive items 1 & 2;
 * items 3 & 4 ride on HR-domain integrations and the Trust hub —
 * applicable across any HR platform variant (workcaptain, maqaleed-
 * workforce) without WC-specific code paths.
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

  // (1) PDPL — driven by brand.trustBand.pdpl (workforce platforms in
  //     KSA all run under PDPL).
  if (tb.pdpl) {
    items.push({
      icon: '🛡',
      label: locale === 'ar' ? 'متوافق مع نظام حماية البيانات الشخصية' : 'PDPL-compliant',
    })
  }

  // (2) In-Kingdom residency — driven by brand.trustBand.residency =
  //     'me-central2-ksa' (Cloud Blueprint v2.1 §11 region-lock).
  if (tb.residency === 'me-central2-ksa') {
    items.push({
      icon: '📍',
      label: locale === 'ar'
        ? 'البيانات مُخزَّنة في المملكة العربية السعودية (الدمام)'
        : 'Data stored in Saudi Arabia (me-central2 / Dammam)',
    })
  }

  // (3) HR-domain integrations — replaces SAMA-aware. HRSD = Saudi
  //     Ministry of Human Resources & Social Development. Qiwa, GOSI,
  //     Mudad are HR regulatory adapters specified across brief §3.3-§3.5.
  //     "via licensed partners" mirrors brief §3.4 language and prevents
  //     over-claiming of direct integration.
  items.push({
    icon: '🤝',
    label: locale === 'ar'
      ? 'تكامل مع وزارة الموارد البشرية وقِوى والتأمينات الاجتماعية عبر شركاء مرخّصين'
      : 'HRSD / Qiwa / GOSI integration via licensed partners',
  })

  // (4) Audit + consent + export — replaces NCA-ECC-aware. Concrete
  //     admin-facing trust artefacts that ARE surfaced in the product
  //     (Trust hub: brief §6 audit trail, consent ledger, data export).
  items.push({
    icon: '📜',
    label: locale === 'ar'
      ? 'سجل مراجعة كامل، وموافقات، وتصدير بيانات يراها مسؤول المؤسسة'
      : 'Full audit trail, consent, data export visible to admin',
  })

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

  // Endorsement disclaimer (UX-G2 V1.1 §7.1 A5).
  // Day 7 fix #4: rewritten to match the new band content. Points
  // honest-claims work to the Trust hub Residency surface.
  const disclaimer = document.createElement('p')
  disclaimer.className = 'wc-trust__disclaimer'
  disclaimer.textContent = locale === 'ar'
    ? 'بيانات الموقف أعلاه استرشادية. التكامل مع الجهات يتم عبر شركاء مرخّصين. تفاصيل ما لا نؤكده (مثل ترخيص ساما أو شهادة NCA ECC) موجودة في صفحة الثقة › الموقع الجغرافي.'
    : 'Posture statements above are informational. Regulator integration is via licensed partners. What we do not claim (e.g., SAMA licensing, NCA ECC certification) is disclosed on Trust › Residency.'
  section.appendChild(disclaimer)

  return section
}

export default renderTrustBand
