'use strict'

/**
 * S39-G5 — ERI Score Service (Employment Reputation Index)
 *
 * Full 5-component scoring model. Does NOT modify eri_engine.js (legacy).
 *
 * ERI Score (0–100):
 *   on_time_delivery_pct  × 0.30  — punctuality on deliverables
 *   dispute_rate_pct      × 0.20  — inverted (lower dispute rate = better)
 *   rehire_rate_pct       × 0.25  — clients returning to work again
 *   responsiveness_score  × 0.15  — response time / communication quality
 *   tenure_score          × 0.10  — platform tenure (capped at 60 months → 100)
 *
 * Score interpretation:
 *   90–100  ELITE
 *   75–89   EXCELLENT
 *   60–74   GOOD
 *   45–59   DEVELOPING
 *    0–44   NEW
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const WEIGHTS = {
  on_time_delivery:  0.30,
  dispute_avoidance: 0.20,   // 100 - dispute_rate_pct
  rehire_rate:       0.25,
  responsiveness:    0.15,
  tenure:            0.10,
}

const TENURE_CAP_MONTHS = 60   // 60 months → 100 tenure_score

const INTERPRETATION = [
  { min: 90,  max: 100, label: 'Elite',       label_ar: 'نخبة',          color: '#6c2bdb' },
  { min: 75,  max: 89,  label: 'Excellent',   label_ar: 'ممتاز',         color: '#1a7f37' },
  { min: 60,  max: 74,  label: 'Good',        label_ar: 'جيد',           color: '#0969da' },
  { min: 45,  max: 59,  label: 'Developing',  label_ar: 'في التطور',     color: '#bf8700' },
  { min: 0,   max: 44,  label: 'New',         label_ar: 'جديد',          color: '#888888' },
]

const BADGE_RULES = [
  {
    id:        'ON_TIME_MASTER',
    label:     'On-Time Master',
    label_ar:  'سيد الالتزام بالمواعيد',
    icon:      '⏱',
    condition: (c) => c.on_time_delivery_pct >= 95,
  },
  {
    id:        'DISPUTE_FREE',
    label:     'Dispute-Free',
    label_ar:  'خالٍ من النزاعات',
    icon:      '🛡',
    condition: (c) => c.dispute_rate_pct === 0,
  },
  {
    id:        'HIGHLY_REHIRED',
    label:     'Highly Rehired',
    label_ar:  'يُعاد توظيفه باستمرار',
    icon:      '🔁',
    condition: (c) => c.rehire_rate_pct >= 75,
  },
  {
    id:        'RESPONSIVE',
    label:     'Highly Responsive',
    label_ar:  'سريع الاستجابة',
    icon:      '💬',
    condition: (c) => c.responsiveness_score >= 90,
  },
  {
    id:        'VETERAN',
    label:     'Platform Veteran',
    label_ar:  'مخضرم المنصة',
    icon:      '🏅',
    condition: (c) => c.platform_tenure_months >= 24,
  },
]

// ── Error helper ──────────────────────────────────────────────────────────────

function eriError(message, code) {
  const e = new Error(message)
  e.code = code
  return e
}

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * computeERI(components)
 *
 * @param {{
 *   on_time_delivery_pct:  number,   // 0–100
 *   dispute_rate_pct:      number,   // 0–100 (lower = better)
 *   rehire_rate_pct:       number,   // 0–100
 *   responsiveness_score:  number,   // 0–100
 *   platform_tenure_months: number,  // months active on platform
 * }} components
 *
 * @returns {{
 *   score:          number,      // 0–100, rounded to 1 decimal
 *   interpretation: object,
 *   component_scores: object,    // weighted contributions
 *   earned_badges:  string[],    // badge IDs
 * }}
 */
function computeERI(components) {
  _validateComponents(components)

  const tenureScore = Math.min(components.platform_tenure_months / TENURE_CAP_MONTHS * 100, 100)
  const disputeAvoidance = 100 - components.dispute_rate_pct

  const raw =
    components.on_time_delivery_pct * WEIGHTS.on_time_delivery +
    disputeAvoidance                * WEIGHTS.dispute_avoidance +
    components.rehire_rate_pct      * WEIGHTS.rehire_rate       +
    components.responsiveness_score * WEIGHTS.responsiveness    +
    tenureScore                     * WEIGHTS.tenure

  const score = Math.round(raw * 10) / 10  // 1 decimal

  const interpretation = INTERPRETATION.find(i => score >= i.min && score <= i.max)
    || INTERPRETATION[INTERPRETATION.length - 1]

  const component_scores = {
    on_time_delivery:  round1(components.on_time_delivery_pct  * WEIGHTS.on_time_delivery),
    dispute_avoidance: round1(disputeAvoidance                 * WEIGHTS.dispute_avoidance),
    rehire_rate:       round1(components.rehire_rate_pct       * WEIGHTS.rehire_rate),
    responsiveness:    round1(components.responsiveness_score  * WEIGHTS.responsiveness),
    tenure:            round1(tenureScore                      * WEIGHTS.tenure),
  }

  const earned_badges = BADGE_RULES
    .filter(r => r.condition(components))
    .map(r => r.id)

  return { score, interpretation, component_scores, earned_badges }
}

/**
 * interpretScore(score)
 *
 * Returns the interpretation object for a raw score.
 */
function interpretScore(score) {
  return INTERPRETATION.find(i => score >= i.min && score <= i.max)
    || INTERPRETATION[INTERPRETATION.length - 1]
}

/**
 * listBadges()  — returns all badge definitions (for UI rendering)
 */
function listBadges() {
  return BADGE_RULES.map(({ id, label, label_ar, icon }) => ({ id, label, label_ar, icon }))
}

// ── In-memory profile store ───────────────────────────────────────────────────

class InMemoryERIStore {
  constructor() {
    this._profiles = new Map()  // workerId → { components, projects, trend }
  }

  get(workerId) {
    return this._profiles.get(workerId) || null
  }

  set(workerId, profile) {
    this._profiles.set(workerId, profile)
  }

  has(workerId) {
    return this._profiles.has(workerId)
  }

  all() {
    return Array.from(this._profiles.entries()).map(([id, p]) => ({ worker_id: id, ...p }))
  }
}

// ── Service factory ───────────────────────────────────────────────────────────

/**
 * createERIService({ store, hooks? })
 *
 * Returns a service object with methods for ERI score, trend, profile.
 */
function createERIService(opts) {
  opts = opts || {}
  const store = opts.store || new InMemoryERIStore()
  const hooks = opts.hooks || { emit: () => {} }

  return {
    /**
     * getScore(workerId)
     * Returns full ERI result for a worker. Throws ERI_PROFILE_NOT_FOUND if absent.
     */
    getScore(workerId) {
      const profile = store.get(workerId)
      if (!profile) throw eriError(`Worker "${workerId}" has no ERI profile`, 'ERI_PROFILE_NOT_FOUND')
      const result = computeERI(profile.components)
      hooks.emit('eri.score_computed', { workerId, score: result.score })
      return { worker_id: workerId, ...result, components: profile.components }
    },

    /**
     * getTrend(workerId)
     * Returns 6-month ERI trend data. Each entry: { month, score, label }.
     */
    getTrend(workerId) {
      const profile = store.get(workerId)
      if (!profile) throw eriError(`Worker "${workerId}" has no ERI profile`, 'ERI_PROFILE_NOT_FOUND')
      return {
        worker_id: workerId,
        trend: profile.trend || _buildDefaultTrend(profile.components),
      }
    },

    /**
     * getProfile(workerId)
     * Returns full work identity profile: ERI + projects + badges.
     */
    getProfile(workerId) {
      const profile = store.get(workerId)
      if (!profile) throw eriError(`Worker "${workerId}" has no ERI profile`, 'ERI_PROFILE_NOT_FOUND')

      const eri = computeERI(profile.components)
      const badgeDefs = BADGE_RULES
        .filter(r => r.condition(profile.components))
        .map(({ id, label, label_ar, icon }) => ({ id, label, label_ar, icon }))

      return {
        worker_id:    workerId,
        display_name: profile.display_name || workerId,
        eri,
        components:   profile.components,
        projects:     profile.projects || [],
        badges:       badgeDefs,
        trend:        profile.trend || _buildDefaultTrend(profile.components),
        share_token:  _generateShareToken(workerId),
      }
    },

    /**
     * getEmployerSummary(workerId)
     * Returns the compact employer-facing summary card:
     * ERI score + top 3 strongest signals.
     */
    getEmployerSummary(workerId) {
      const profile = store.get(workerId)
      if (!profile) throw eriError(`Worker "${workerId}" has no ERI profile`, 'ERI_PROFILE_NOT_FOUND')

      const eri = computeERI(profile.components)

      // Top 3: pick component_scores with highest weighted contribution
      const scores = Object.entries(eri.component_scores)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([key, value]) => ({ signal: key, contribution: value }))

      return {
        worker_id:    workerId,
        display_name: profile.display_name || workerId,
        eri_score:    eri.score,
        interpretation: eri.interpretation,
        top_signals:  scores,
        earned_badges: eri.earned_badges,
      }
    },

    /**
     * upsertProfile(workerId, profileData)
     * Insert or update a worker's ERI profile. Used by seed/import flows.
     */
    upsertProfile(workerId, profileData) {
      if (!workerId) throw eriError('workerId is required', 'MISSING_WORKER_ID')
      _validateComponents(profileData.components || {})
      store.set(workerId, profileData)
      return { worker_id: workerId, updated: true }
    },

    store,
  }
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _validateComponents(c) {
  const required = ['on_time_delivery_pct', 'dispute_rate_pct', 'rehire_rate_pct',
    'responsiveness_score', 'platform_tenure_months']

  for (const field of required) {
    if (typeof c[field] !== 'number' || !Number.isFinite(c[field])) {
      throw eriError(`components.${field} must be a finite number`, 'INVALID_COMPONENT')
    }
  }

  const pct = ['on_time_delivery_pct', 'dispute_rate_pct', 'rehire_rate_pct', 'responsiveness_score']
  for (const field of pct) {
    if (c[field] < 0 || c[field] > 100) {
      throw eriError(`components.${field} must be 0–100`, 'COMPONENT_OUT_OF_RANGE')
    }
  }

  if (c.platform_tenure_months < 0) {
    throw eriError('components.platform_tenure_months must be >= 0', 'COMPONENT_OUT_OF_RANGE')
  }
}

function _buildDefaultTrend(currentComponents) {
  // Synthesise a 6-month trend by progressively reducing from current score
  const months = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now)
    d.setMonth(d.getMonth() - i)
    const label = d.toLocaleString('en-SA', { month: 'short', year: 'numeric' })
    const label_ar = d.toLocaleString('ar-SA', { month: 'short', year: 'numeric' })
    // Simulate gradual improvement: older months slightly lower
    const factor = 0.88 + (i === 0 ? 0.12 : (5 - i) * 0.02)
    const adjusted = Object.assign({}, currentComponents, {
      on_time_delivery_pct:  Math.min(100, currentComponents.on_time_delivery_pct  * factor),
      rehire_rate_pct:       Math.min(100, currentComponents.rehire_rate_pct       * factor),
      responsiveness_score:  Math.min(100, currentComponents.responsiveness_score  * factor),
      dispute_rate_pct:      Math.min(100, currentComponents.dispute_rate_pct * (2 - factor)),
      platform_tenure_months: Math.max(0, currentComponents.platform_tenure_months - i),
    })
    const { score } = computeERI(adjusted)
    months.push({ month: label, month_ar: label_ar, score })
  }
  return months
}

function _generateShareToken(workerId) {
  // Deterministic short token from workerId for shareable URL
  const hash = workerId.split('').reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0)
  return Math.abs(hash).toString(36).padStart(8, '0').slice(0, 8)
}

function round1(n) {
  return Math.round(n * 10) / 10
}

// ── Demo seed data ─────────────────────────────────────────────────────────────

/**
 * seedDemoProfiles(store)
 * Loads 3 demo profiles into the given store for UI preview.
 */
function seedDemoProfiles(store) {
  const demos = [
    {
      id: 'worker-demo-1',
      display_name: 'Fatima Al-Rashid',
      components: {
        on_time_delivery_pct:   97,
        dispute_rate_pct:        0,
        rehire_rate_pct:        82,
        responsiveness_score:   95,
        platform_tenure_months: 28,
      },
      projects: [
        { id: 'p1', title: 'E-commerce Platform Redesign', client: 'RetailCo', verified: true,  completed_at: '2025-11-15', rating: 5 },
        { id: 'p2', title: 'HR Automation System',         client: 'CorpHR',   verified: true,  completed_at: '2025-08-02', rating: 5 },
        { id: 'p3', title: 'Mobile App — Logistics',       client: 'LogiSA',   verified: false, completed_at: '2025-05-18', rating: 4 },
      ],
    },
    {
      id: 'worker-demo-2',
      display_name: 'Mohammed Al-Ghamdi',
      components: {
        on_time_delivery_pct:   78,
        dispute_rate_pct:        5,
        rehire_rate_pct:        55,
        responsiveness_score:   70,
        platform_tenure_months: 10,
      },
      projects: [
        { id: 'p4', title: 'Corporate Website Build', client: 'BuildCorp', verified: true,  completed_at: '2026-01-20', rating: 4 },
        { id: 'p5', title: 'Data Migration Project',  client: 'DataSA',   verified: false, completed_at: '2025-11-01', rating: 3 },
      ],
    },
    {
      id: 'worker-demo-3',
      display_name: 'Sara Al-Otaibi',
      components: {
        on_time_delivery_pct:   91,
        dispute_rate_pct:        2,
        rehire_rate_pct:        68,
        responsiveness_score:   88,
        platform_tenure_months: 18,
      },
      projects: [
        { id: 'p6', title: 'Compliance Dashboard', client: 'GovDept',   verified: true,  completed_at: '2026-02-14', rating: 5 },
        { id: 'p7', title: 'API Integration Suite', client: 'FinTechSA', verified: true,  completed_at: '2025-12-10', rating: 5 },
      ],
    },
  ]

  demos.forEach(({ id, ...rest }) => store.set(id, rest))
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  computeERI,
  interpretScore,
  listBadges,
  createERIService,
  InMemoryERIStore,
  seedDemoProfiles,
  WEIGHTS,
  INTERPRETATION,
  BADGE_RULES,
}
