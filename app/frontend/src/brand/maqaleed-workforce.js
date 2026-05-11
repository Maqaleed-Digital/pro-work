/*
 * Brand variant: Maqaleed Workforce (B2G / Corporate)
 *
 * CONFIG-ONLY — not deployed in the controlled-beta window. Exists per
 * Sponsor decision B5 (2026-05-11) to scaffold dual-brand capability on
 * day one. Deployment target: workforce.maqaleed.ai.
 *
 * Per BA-001 §11 Pattern B: WorkCaptain ↔ Maqaleed Workforce is the
 * dual-brand pair. Backend identifier `prowork` is preserved across both
 * variants per BA-001 §6.
 *
 * Activation: VITE_BRAND=maqaleed-workforce npm run build. Resolved by
 * src/brand/index.js at runtime / build time via __MAQ_BRAND__ define.
 *
 * @typedef {import('./index.js').BrandVariant} BrandVariant
 * @type {BrandVariant}
 */
export default {
  // ── Identity ────────────────────────────────────────────────────────
  id: 'maqaleed-workforce',
  publicName: {
    en: 'Maqaleed Workforce',
    ar: 'مَقاليد العمل',
  },
  tagline: {
    en: 'Sovereign workforce platform for KSA government entities and large enterprises.',
    ar: 'منصة قوى عاملة سيادية للجهات الحكومية والمؤسسات الكبرى في المملكة.',
  },

  // Hero copy — B2G variant (parallel to workcaptain.js hero field).
  // Day 7 fix #4 (2026-05-16): same commercial framing pattern, targeted
  // at government and large-enterprise audience. Pilot-only language
  // honoured per WC Controlled-Launch Memo V1.1.
  hero: {
    title: {
      en: 'The sovereign workforce platform for KSA government and large enterprise.',
      ar: 'منصة القوى العاملة السيادية للجهات الحكومية والمؤسسات الكبرى في المملكة.',
    },
    lede: {
      en: 'Programme orchestration for Saudisation, payroll, GOSI, Mudad and Qiwa filings, workforce analytics, and HR record-keeping — Saudi-resident, audit-evidenced. Pilot engagements by invitation only.',
      ar: 'تنسيق برامج السعودة، والرواتب، وإيداعات التأمينات وقِوى ومُدد، وتحليلات القوى العاملة، وحفظ سجلات الموارد البشرية — مُستضاف داخل المملكة، مُوثَّق بالأدلة. التكليفات التجريبية بدعوة فقط.',
    },
  },
  // Backend identifier preserved per BA-001 §6 (Pattern B retains backend id).
  backendIdentifier: 'prowork',

  // ── Audience ────────────────────────────────────────────────────────
  audience: 'b2g-corporate',
  deploymentTargets: {
    apex: 'workforce.maqaleed.ai',
    appPath: '/app/',
  },

  // ── Posture ─────────────────────────────────────────────────────────
  // Controlled-beta posture inherited from portfolio rollout cadence.
  // Cohort enrolment for B2G is informational-only per brief §1.
  controlledBeta: true,
  cohortCapMessage: {
    en: 'Government workforce engagements — pilot enrolment by invitation only.',
    ar: 'تكليفات القوى العاملة الحكومية — التسجيل التجريبي بدعوة فقط.',
  },
  defaultMode: 'D',

  // ── Surface copy palette ────────────────────────────────────────────
  copy: {
    requestAccessCta: { en: 'Contact programme team', ar: 'تواصل مع فريق البرنامج' },
    signInCta:        { en: 'Sign in',                ar: 'تسجيل الدخول' },
    cohortRegisterTitle: {
      en: 'Request government / enterprise engagement',
      ar: 'طلب تكليف حكومي / مؤسسي',
    },
  },

  // ── Brand-token preferences ─────────────────────────────────────────
  themeClass: 'theme-maqaleed-workforce',

  // ── Regulator surface references ────────────────────────────────────
  // Same regulator set as WorkCaptain — workforce regulator surface is
  // not brand-dependent. WC-OPS-001 V1.0 §7 prohibits no governance
  // expansion in-window.
  regulators: ['nafath', 'absher', 'wathq', 'gosi', 'mudad', 'qiwa', 'zatca'],

  // ── Trust band content ─────────────────────────────────────────────
  trustBand: {
    pdpl: true,
    residency: 'me-central2-ksa',
    samaPosture: 'aware',
    ncaEccPosture: 'aware',
  },
}
