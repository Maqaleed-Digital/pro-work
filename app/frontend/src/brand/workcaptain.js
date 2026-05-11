/*
 * Brand variant: WorkCaptain (B2C / SMB)
 *
 * Active variant for the controlled-beta window (D15→D15+41).
 * Deployed at workcaptain.ai apex. Backend identifier `prowork` preserved
 * per BA-001 §6 (PROPOSAL §1.1, Sponsor B-extra-2).
 *
 * Per PROPOSAL §11.A5 portfolio reuse rule: this file is the ONLY place
 * WorkCaptain-specific copy / styling / regulator-reference content lives.
 * Components consume this config; they remain brand-neutral so the same
 * primitives transplant to Crédito / Società / S2PPRO / VetiCare in
 * subsequent waves.
 *
 * Per BA-001 §11 Pattern B (dual-brand): public commercial brand is
 * "WorkCaptain" on customer-facing surfaces; the alternate corporate /
 * B2G variant is maqaleed-workforce.js (config-only; not deployed in
 * controlled-beta window).
 *
 * @typedef {import('./index.js').BrandVariant} BrandVariant
 * @type {BrandVariant}
 */
export default {
  // ── Identity ────────────────────────────────────────────────────────
  id: 'workcaptain',
  publicName: {
    en: 'WorkCaptain',
    ar: 'وورك كابتن',
  },
  tagline: {
    en: 'Saudi workforce decision-support — Saudisation, Payroll, Compliance.',
    ar: 'دعم قرارات القوى العاملة في المملكة — السعودة، الرواتب، الامتثال.',
  },
  // Backend identifier preserved per BA-001 §6 (PROPOSAL §1.1).
  backendIdentifier: 'prowork',

  // ── Audience ────────────────────────────────────────────────────────
  audience: 'b2c-smb',  // brief §1: Saudi employers, controlled-beta cohort
  deploymentTargets: {
    apex: 'workcaptain.ai',
    appPath: '/app/',
  },

  // ── Posture (binding for controlled beta) ──────────────────────────
  controlledBeta: true,                  // WC Controlled-Launch Memo V1.1
  cohortCapMessage: {                    // displayed on landing per brief §1
    en: 'Currently in controlled beta — accepting a limited cohort of Saudi employers.',
    ar: 'مرحلة تجريبية مُدارة — نستقبل عدداً محدوداً من أصحاب العمل في المملكة.',
  },
  defaultMode: 'D',                      // PROPOSAL §11.A2 stricter rule

  // ── Surface copy palette (brand-specific strings only) ─────────────
  copy: {
    requestAccessCta: { en: 'Request access', ar: 'طلب الوصول' },
    signInCta:        { en: 'Sign in',        ar: 'تسجيل الدخول' },
    cohortRegisterTitle: {
      en: 'Request controlled-beta access',
      ar: 'طلب الوصول إلى المرحلة التجريبية المُدارة',
    },
  },

  // ── Brand-token preferences (consumed by components via CSS class) ─
  // Map to canonical --maq-brand-* (navy primary, gold accent, green secondary).
  // No literal hex values here — all resolve through G1 tokens.
  themeClass: 'theme-workcaptain',

  // ── Regulator surface references (informational; not endorsement) ──
  // Per UX-G2 V1.1 §7.1 endorsement disclaimer: WorkCaptain does not imply
  // official endorsement absent a recorded governance instrument.
  regulators: ['nafath', 'absher', 'wathq', 'gosi', 'mudad', 'qiwa', 'zatca'],

  // ── Trust band content (brief §1) ───────────────────────────────────
  trustBand: {
    pdpl: true,                         // PDPL compliance posture surfaced
    residency: 'me-central2-ksa',       // Cloud Blueprint v2.1 §11
    samaPosture: 'aware',               // not licensed; aware of framework
    ncaEccPosture: 'aware',             // NCA ECC baseline awareness
  },
}
