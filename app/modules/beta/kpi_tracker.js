'use strict'

/**
 * S39-G6 KPI Tracker
 *
 * Tracks exit-criteria KPIs:
 *   - p75_time_to_first_proposal  — ≤4h (14400 seconds)
 *   - match_rate                  — ≥45% (0.45)
 *   - payout_eta_breach_rate      — <1% (0.01)
 *   - accessibility_aa_pass_rate  — ≥95% (0.95)
 *
 * RAG thresholds: GREEN when within target, AMBER when close (≤10% off),
 * RED otherwise. All computed from real observed data — never hardcoded.
 *
 * Design: thin tracker with append-only event log + computed summaries.
 */

const EXIT_CRITERIA = {
  p75_time_to_first_proposal:  { target: 14400,  direction: 'lte', label: 'p75 Time to First Proposal ≤4h' },
  match_rate:                  { target: 0.45,   direction: 'gte', label: 'Match Rate ≥45%' },
  payout_eta_breach_rate:      { target: 0.01,   direction: 'lte', label: 'Payout ETA Breach Rate <1%' },
  accessibility_aa_pass_rate:  { target: 0.95,   direction: 'gte', label: 'Accessibility AA Pass Rate ≥95%' },
}

// Amber zone: within 10% of target (direction-aware)
const AMBER_MARGIN = 0.10

function computeRag(kpiKey, value) {
  const spec = EXIT_CRITERIA[kpiKey]
  if (spec === undefined) return 'UNKNOWN'
  if (value === null || value === undefined) return 'GREY'  // no data yet

  const { target, direction } = spec
  const passes = direction === 'lte' ? value <= target : value >= target
  if (passes) return 'GREEN'

  // Amber: close to target — within AMBER_MARGIN of target
  const distance = Math.abs(value - target) / (target || 1)
  if (distance <= AMBER_MARGIN) return 'AMBER'

  return 'RED'
}

class InMemoryKpiStore {
  constructor() {
    this._events = []   // raw event log
    this._gauges = new Map()  // kpiKey → latest scalar value (for non-event-sourced updates)
  }

  appendEvent(event) {
    this._events.push(Object.assign({}, event, { recorded_at: new Date().toISOString() }))
  }

  setGauge(kpiKey, value) {
    this._gauges.set(kpiKey, { value, updated_at: new Date().toISOString() })
  }

  getGauge(kpiKey) {
    return this._gauges.get(kpiKey) || null
  }

  eventsFor(kpiKey) {
    return this._events.filter(e => e.kpi_key === kpiKey)
  }

  allEvents() {
    return this._events.slice()
  }
}

/**
 * createKpiTracker({ store? })
 *
 * Methods:
 *   recordProposalTime(jobId, seconds)
 *     — append a TFP observation; updates p75 gauge automatically
 *
 *   recordMatchResult(matched)
 *     — matched: boolean; appends to match rate pool
 *
 *   recordPayoutEvent(breached)
 *     — breached: boolean; appends to ETA breach pool
 *
 *   recordAccessibilityResult(passed)
 *     — passed: boolean; appends to AA pass rate pool
 *
 *   setGauge(kpiKey, value)
 *     — directly set a gauge (e.g. from CI pipeline output)
 *
 *   getKpiSummary()
 *     — { kpis: { [key]: { value, target, rag, label } }, all_green: boolean }
 *
 *   getRagScorecard()
 *     — same as getKpiSummary but returns rag per criterion + overall verdict
 */
function createKpiTracker(opts) {
  opts = opts || {}
  const store = opts.store || new InMemoryKpiStore()

  function computeP75(values) {
    if (!values.length) return null
    const sorted = values.slice().sort((a, b) => a - b)
    const idx = Math.ceil(0.75 * sorted.length) - 1
    return sorted[Math.max(0, idx)]
  }

  function computeRate(events) {
    if (!events.length) return null
    const positives = events.filter(e => e.positive).length
    return positives / events.length
  }

  function getCurrentValue(kpiKey) {
    switch (kpiKey) {
      case 'p75_time_to_first_proposal': {
        const evts = store.eventsFor(kpiKey)
        const g    = store.getGauge(kpiKey)
        if (evts.length > 0) return computeP75(evts.map(e => e.value_seconds))
        return g ? g.value : null
      }
      case 'match_rate': {
        const evts = store.eventsFor(kpiKey)
        const g    = store.getGauge(kpiKey)
        if (evts.length > 0) return computeRate(evts)
        return g ? g.value : null
      }
      case 'payout_eta_breach_rate': {
        const evts = store.eventsFor(kpiKey)
        const g    = store.getGauge(kpiKey)
        if (evts.length > 0) return computeRate(evts)
        return g ? g.value : null
      }
      case 'accessibility_aa_pass_rate': {
        const evts = store.eventsFor(kpiKey)
        const g    = store.getGauge(kpiKey)
        if (evts.length > 0) return computeRate(evts)
        return g ? g.value : null
      }
      default:
        return null
    }
  }

  return {
    recordProposalTime(jobId, seconds) {
      store.appendEvent({ kpi_key: 'p75_time_to_first_proposal', job_id: jobId, value_seconds: seconds })
    },

    recordMatchResult(matched) {
      store.appendEvent({ kpi_key: 'match_rate', positive: !!matched })
    },

    recordPayoutEvent(breached) {
      // positive = breach occurred — so computeRate gives breach rate directly
      store.appendEvent({ kpi_key: 'payout_eta_breach_rate', positive: !!breached })
    },

    recordAccessibilityResult(passed) {
      store.appendEvent({ kpi_key: 'accessibility_aa_pass_rate', positive: !!passed })
    },

    setGauge(kpiKey, value) {
      if (!EXIT_CRITERIA[kpiKey]) {
        const err = new Error(`Unknown KPI key: "${kpiKey}"`)
        err.code = 'KPI_UNKNOWN'
        throw err
      }
      store.setGauge(kpiKey, value)
    },

    getKpiSummary() {
      const kpis = {}
      let allGreen = true

      for (const [key, spec] of Object.entries(EXIT_CRITERIA)) {
        const value = getCurrentValue(key)
        const rag   = computeRag(key, value)
        if (rag !== 'GREEN') allGreen = false
        kpis[key] = {
          value,
          target:    spec.target,
          direction: spec.direction,
          label:     spec.label,
          rag,
        }
      }

      return { kpis, all_green: allGreen }
    },

    getRagScorecard() {
      const summary = this.getKpiSummary()
      return {
        criteria:  summary.kpis,
        all_green: summary.all_green,
        verdict:   summary.all_green ? 'EXIT_READY' : 'NOT_READY',
        evaluated_at: new Date().toISOString(),
      }
    },

    store,
    EXIT_CRITERIA,
  }
}

module.exports = { createKpiTracker, InMemoryKpiStore, EXIT_CRITERIA, computeRag: computeRag }
