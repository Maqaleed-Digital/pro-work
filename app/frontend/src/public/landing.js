/*
 * Landing page orchestrator
 *
 * Mounts the controlled-beta public marketing surface at the apex `/`.
 * Composes brand-neutral components from src/components/ with brand
 * config from src/brand/index.js.
 *
 * Authority:
 *   - brief §1 (public marketing landing)
 *   - WC Controlled-Launch Memo V1.1 (controlled-beta posture binding)
 *   - PROPOSAL §11.A1 portfolio reuse rule: components below transplant
 *     to Crédito / Società / S2PPRO / VetiCare landing pages
 *
 * CTA wiring: Day 2 routes "Request access" and "Sign in" to the SPA at
 * /app/#register and /app/#signin respectively. The cohort registration
 * page (brief §2) is built Day 3; the SPA already has register.js + a
 * backend POST /api/auth/register. Until cohort gating ships Day 3,
 * "Request access" is gated behind a brief disabled state with
 * "Coming Day 3" placeholder per PROPOSAL §11.A4 (no phantom features).
 */

import { getBrand, applyBrandTheme } from '../brand/index.js'
import { initLocale, getLocale } from '../locale.js'
import { renderLanguageToggle, applyLocaleToDocument } from '../components/language_toggle.js'
import { renderControlledBetaBanner } from '../components/controlled_beta_banner.js'
import { renderHero } from '../components/hero.js'
import { renderTrustBand } from '../components/trust_band.js'
import { renderFeatureSection } from '../components/feature_section.js'
import { renderPricingOutline } from '../components/pricing_outline.js'

/**
 * WC capability features for the landing page.
 *
 * Per PROPOSAL §11.A5: WC-specific feature copy lives at this orchestrator
 * level, not inside components. Components consume this as input.
 *
 * Mode discipline per brief §4 + stricter default (§11.A2): all five
 * capabilities default to Mode D during controlled beta. Mode A requires
 * AM-001 5-test verification handled out-of-band — NEVER toggled in UI.
 */
function getWCFeatures() {
  return [
    {
      id: 'WC-SAUD',
      title: { en: 'Saudisation OS', ar: 'نظام السعودة' },
      body: {
        en: 'Track Nitaqat zone status, Saudi-employee ratios, and trend signals against MoHRSD targets. Agent-attributed advice on cohort-specific moves.',
        ar: 'تتبّع حالة نطاق نطاقات، ونسب الموظفين السعوديين، ومؤشرات الاتجاه مقابل أهداف وزارة الموارد البشرية. توصيات استشارية منسوبة إلى وكيل ذكي.',
      },
      mode: 'D',
    },
    {
      id: 'WC-PYR',
      title: { en: 'Payroll', ar: 'الرواتب' },
      body: {
        en: 'WPS readiness pack, payroll run inspection, payout-matrix visibility. Payment processing routed via licensed partners.',
        ar: 'حزمة جاهزية نظام حماية الأجور (WPS)، ومراجعة دورات الرواتب، ومصفوفة المدفوعات. تتم معالجة الدفع عبر شركاء مرخّصين.',
      },
      mode: 'D',
    },
    {
      id: 'WC-WFA',
      title: { en: 'Workforce Analytics', ar: 'تحليلات القوى العاملة' },
      body: {
        en: 'Headcount trends, cost-per-role analysis, anomaly detection — with calibrated confidence and clickable source citations on every output.',
        ar: 'اتجاهات أعداد الموظفين، وتحليل التكلفة لكل دور، واكتشاف الشذوذ — مع ثقة معايَرة واستشهادات مصدر قابلة للنقر على كل مخرج.',
      },
      mode: 'D',
    },
    {
      id: 'WC-REC',
      title: { en: 'Record-keeping', ar: 'حفظ السجلات' },
      body: {
        en: 'Employee profiles, contracts, lifecycle events, evidence packs. PDPL-aligned consent ledger and data-subject request workflow.',
        ar: 'ملفات الموظفين، والعقود، وأحداث دورة حياة الموظف، وحزم الأدلة. سجل موافقات متوافق مع نظام حماية البيانات، وسير عمل طلبات أصحاب البيانات.',
      },
      mode: 'D',
    },
    {
      id: 'WC-B2G',
      title: { en: 'Government workforce', ar: 'القوى العاملة الحكومية' },
      body: {
        en: 'Programme orchestration for Saudi government entities and large enterprises. Pilot engagements by invitation only.',
        ar: 'تنسيق البرامج للجهات الحكومية والمؤسسات الكبرى في المملكة. التكليفات التجريبية بدعوة فقط.',
      },
      mode: 'D',
      informationalOnly: true,  // brief §1 — cohort enrolment not yet open
    },
  ]
}

/**
 * Header strip: brand wordmark + language toggle. Brand-neutral component
 * structure; brand name comes from brand config.
 */
function renderHeader(brand, locale, rerender) {
  const header = document.createElement('header')
  header.setAttribute('data-component', 'landing-header')
  header.setAttribute('role', 'banner')
  header.className = 'wc-header'

  const wordmark = document.createElement('a')
  wordmark.href = '/'
  wordmark.className = 'wc-header__wordmark'
  wordmark.textContent = (brand && brand.publicName && brand.publicName[locale]) || 'WorkCaptain'
  wordmark.setAttribute('aria-label', locale === 'ar' ? 'الصفحة الرئيسية لـ وورك كابتن' : 'WorkCaptain home')
  header.appendChild(wordmark)

  const nav = document.createElement('nav')
  nav.className = 'wc-header__nav'
  nav.setAttribute('aria-label', locale === 'ar' ? 'الإعدادات' : 'Settings')
  nav.appendChild(renderLanguageToggle({ onChange: rerender }))
  header.appendChild(nav)

  return header
}

/**
 * Footer: minimal — controlled-beta posture restatement + legal links
 * (placeholders for now; Day 6 fills in privacy / terms when those
 * surfaces ship).
 */
function renderFooter(locale) {
  const footer = document.createElement('footer')
  footer.setAttribute('role', 'contentinfo')
  footer.className = 'wc-footer'

  const copyrightYear = new Date().getFullYear()
  const copy = document.createElement('p')
  copy.className = 'wc-footer__copy'
  copy.textContent = locale === 'ar'
    ? `© ${copyrightYear} مَقاليد الرقمية. وورك كابتن في مرحلة تجريبية مُدارة.`
    : `© ${copyrightYear} Maqaleed Digital. WorkCaptain is in controlled beta.`
  footer.appendChild(copy)

  const links = document.createElement('p')
  links.className = 'wc-footer__links'
  // Placeholders — labelled per A4: "Coming later" via disabled state.
  const placeholders = [
    { en: 'Privacy', ar: 'الخصوصية' },
    { en: 'Terms', ar: 'الشروط' },
    { en: 'Status', ar: 'الحالة' },
  ]
  for (let i = 0; i < placeholders.length; i++) {
    const p = placeholders[i]
    const a = document.createElement('a')
    a.href = '#'
    a.setAttribute('aria-disabled', 'true')
    a.setAttribute('tabindex', '-1')
    a.title = locale === 'ar' ? 'سيُتاح لاحقًا' : 'Coming later'
    a.textContent = p[locale] || p.en
    a.style.color = 'var(--maq-neutral-400)'
    a.style.pointerEvents = 'none'
    links.appendChild(a)
    if (i < placeholders.length - 1) {
      const sep = document.createElement('span')
      sep.setAttribute('aria-hidden', 'true')
      sep.textContent = ' · '
      sep.style.color = 'var(--maq-neutral-300)'
      links.appendChild(sep)
    }
  }
  footer.appendChild(links)

  return footer
}

/**
 * Main mount.
 */
async function mount() {
  await initLocale()
  applyLocaleToDocument()
  applyBrandTheme()

  const root = document.getElementById('landing-root')
  if (!root) {
    console.error('[landing] #landing-root not found')
    return
  }

  function render() {
    const brand = getBrand()
    const locale = getLocale()

    // Clear root
    while (root.firstChild) root.removeChild(root.firstChild)

    // Controlled-beta banner — top of page, non-blocking
    root.appendChild(renderControlledBetaBanner({ brand, locale }))

    // Header
    root.appendChild(renderHeader(brand, locale, render))

    // Hero (the 30-second "what is this" rule per §11.A3)
    root.appendChild(renderHero({
      brand,
      locale,
      onRequestAccess: handleRequestAccess,
      onSignIn: handleSignIn,
    }))

    // Trust band
    root.appendChild(renderTrustBand({ brand, locale }))

    // Feature sections (WC-SAUD / WC-PYR / WC-WFA / WC-REC / WC-B2G)
    root.appendChild(renderFeatureSection({
      features: getWCFeatures(),
      locale,
    }))

    // Pricing outline (Mode-D framed; no checkout)
    root.appendChild(renderPricingOutline({ locale }))

    // Footer
    root.appendChild(renderFooter(locale))
  }

  // Re-render on locale change
  document.addEventListener('maq:locale-changed', render)

  render()
}

/**
 * CTA handlers — Day 2 placeholder routing.
 * Day 3 wires real cohort-registration flow (brief §2).
 */
function handleRequestAccess() {
  // Day 3 will replace this with a real cohort-registration form per
  // PROPOSAL §11.A4 no-phantom-features rule. For Day 2 the landing
  // routes to the existing /app/#register surface (which uses
  // app/api/auth/register backend — already functional).
  window.location.href = '/app/#register'
}

function handleSignIn() {
  window.location.href = '/app/#signin'
}

mount().catch(err => {
  console.error('[landing] mount failed:', err)
})
