'use strict'

/**
 * KPI Tracker Tests — S39-G6 Part 2
 *
 * Tests:
 *   - Exit criteria thresholds
 *   - RAG computation from real observed data
 *   - p75 TFP ≤4h
 *   - match rate ≥45%
 *   - payout ETA breach <1%
 *   - accessibility AA ≥95%
 *   - CEO exit review gating
 */

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')
const { createKpiTracker, EXIT_CRITERIA, computeRag } = require('../app/modules/beta/kpi_tracker')

describe('Exit criteria constants', () => {
  it('p75 TFP target is 14400 seconds (4h)', () => {
    assert.equal(EXIT_CRITERIA.p75_time_to_first_proposal.target, 14400)
    assert.equal(EXIT_CRITERIA.p75_time_to_first_proposal.direction, 'lte')
  })

  it('match_rate target is 0.45', () => {
    assert.equal(EXIT_CRITERIA.match_rate.target, 0.45)
    assert.equal(EXIT_CRITERIA.match_rate.direction, 'gte')
  })

  it('payout_eta_breach_rate target is 0.01', () => {
    assert.equal(EXIT_CRITERIA.payout_eta_breach_rate.target, 0.01)
    assert.equal(EXIT_CRITERIA.payout_eta_breach_rate.direction, 'lte')
  })

  it('accessibility_aa_pass_rate target is 0.95', () => {
    assert.equal(EXIT_CRITERIA.accessibility_aa_pass_rate.target, 0.95)
    assert.equal(EXIT_CRITERIA.accessibility_aa_pass_rate.direction, 'gte')
  })
})

describe('computeRag — unit', () => {
  it('returns GREY when value is null', () => {
    assert.equal(computeRag('match_rate', null), 'GREY')
  })

  it('match_rate 0.60 (above 0.45) → GREEN', () => {
    assert.equal(computeRag('match_rate', 0.60), 'GREEN')
  })

  it('match_rate 0.45 exactly → GREEN', () => {
    assert.equal(computeRag('match_rate', 0.45), 'GREEN')
  })

  it('match_rate 0.41 (close, within 10% of 0.45) → AMBER', () => {
    assert.equal(computeRag('match_rate', 0.41), 'AMBER')
  })

  it('match_rate 0.20 → RED', () => {
    assert.equal(computeRag('match_rate', 0.20), 'RED')
  })

  it('p75_TFP 7200 (2h, ≤4h) → GREEN', () => {
    assert.equal(computeRag('p75_time_to_first_proposal', 7200), 'GREEN')
  })

  it('p75_TFP 14400 exactly → GREEN', () => {
    assert.equal(computeRag('p75_time_to_first_proposal', 14400), 'GREEN')
  })

  it('p75_TFP 14900 (just over 4h, within 10%) → AMBER', () => {
    assert.equal(computeRag('p75_time_to_first_proposal', 14900), 'AMBER')
  })

  it('p75_TFP 28800 (8h, far over) → RED', () => {
    assert.equal(computeRag('p75_time_to_first_proposal', 28800), 'RED')
  })

  it('payout_eta_breach_rate 0.005 (< 1%) → GREEN', () => {
    assert.equal(computeRag('payout_eta_breach_rate', 0.005), 'GREEN')
  })

  it('payout_eta_breach_rate 0.05 → RED', () => {
    assert.equal(computeRag('payout_eta_breach_rate', 0.05), 'RED')
  })

  it('accessibility_aa_pass_rate 0.97 (> 95%) → GREEN', () => {
    assert.equal(computeRag('accessibility_aa_pass_rate', 0.97), 'GREEN')
  })

  it('accessibility_aa_pass_rate 0.70 (far below 95%) → RED', () => {
    assert.equal(computeRag('accessibility_aa_pass_rate', 0.70), 'RED')
  })
})

describe('KPI tracker — p75 time to first proposal', () => {
  let tracker

  before(() => { tracker = createKpiTracker() })

  it('initial value is null (GREY)', () => {
    const s = tracker.getKpiSummary()
    assert.equal(s.kpis.p75_time_to_first_proposal.value, null)
    assert.equal(s.kpis.p75_time_to_first_proposal.rag, 'GREY')
  })

  it('records proposal times and computes p75', () => {
    // 4 proposals: 3600, 7200, 10800, 14400 — p75 = 10800 (≤ 14400 → GREEN)
    tracker.recordProposalTime('job-1', 3600)
    tracker.recordProposalTime('job-2', 7200)
    tracker.recordProposalTime('job-3', 10800)
    tracker.recordProposalTime('job-4', 14400)
    const s = tracker.getKpiSummary()
    assert.equal(s.kpis.p75_time_to_first_proposal.rag, 'GREEN')
    assert.ok(s.kpis.p75_time_to_first_proposal.value <= 14400)
  })

  it('setGauge overrides when no events', () => {
    const t2 = createKpiTracker()
    t2.setGauge('p75_time_to_first_proposal', 18000)  // 5h — AMBER
    const s = t2.getKpiSummary()
    assert.equal(s.kpis.p75_time_to_first_proposal.value, 18000)
    assert.ok(['AMBER','RED'].includes(s.kpis.p75_time_to_first_proposal.rag))
  })
})

describe('KPI tracker — match rate', () => {
  let tracker

  before(() => { tracker = createKpiTracker() })

  it('initial match_rate is GREY', () => {
    assert.equal(tracker.getKpiSummary().kpis.match_rate.rag, 'GREY')
  })

  it('5/10 matches (50%) → GREEN (≥45%)', () => {
    for (let i = 0; i < 5; i++) tracker.recordMatchResult(true)
    for (let i = 0; i < 5; i++) tracker.recordMatchResult(false)
    const s = tracker.getKpiSummary()
    assert.equal(s.kpis.match_rate.rag, 'GREEN')
    assert.ok(Math.abs(s.kpis.match_rate.value - 0.5) < 0.001)
  })

  it('2/10 matches (20%) → RED', () => {
    const t2 = createKpiTracker()
    for (let i = 0; i < 2; i++) t2.recordMatchResult(true)
    for (let i = 0; i < 8; i++) t2.recordMatchResult(false)
    assert.equal(t2.getKpiSummary().kpis.match_rate.rag, 'RED')
  })
})

describe('KPI tracker — payout ETA breach rate', () => {
  let tracker

  before(() => { tracker = createKpiTracker() })

  it('zero breaches from 100 payouts → GREEN', () => {
    for (let i = 0; i < 100; i++) tracker.recordPayoutEvent(false)
    assert.equal(tracker.getKpiSummary().kpis.payout_eta_breach_rate.rag, 'GREEN')
  })

  it('10 breaches from 100 payouts (10%) → RED', () => {
    const t2 = createKpiTracker()
    for (let i = 0; i < 10; i++) t2.recordPayoutEvent(true)
    for (let i = 0; i < 90; i++) t2.recordPayoutEvent(false)
    assert.equal(t2.getKpiSummary().kpis.payout_eta_breach_rate.rag, 'RED')
  })
})

describe('KPI tracker — accessibility AA pass rate', () => {
  let tracker

  before(() => { tracker = createKpiTracker() })

  it('initial value is null (GREY)', () => {
    assert.equal(tracker.getKpiSummary().kpis.accessibility_aa_pass_rate.rag, 'GREY')
  })

  it('97/100 pages pass (97%) → GREEN', () => {
    for (let i = 0; i < 97; i++) tracker.recordAccessibilityResult(true)
    for (let i = 0; i < 3;  i++) tracker.recordAccessibilityResult(false)
    assert.equal(tracker.getKpiSummary().kpis.accessibility_aa_pass_rate.rag, 'GREEN')
  })
})

describe('KPI tracker — RAG scorecard and all_green', () => {
  it('all_green is false when any KPI is GREY', () => {
    const t = createKpiTracker()
    const s = t.getRagScorecard()
    assert.equal(s.all_green, false)
    assert.equal(s.verdict, 'NOT_READY')
  })

  it('all_green is true when all KPIs are GREEN', () => {
    const t = createKpiTracker()
    // Set all gauges to GREEN values
    t.setGauge('p75_time_to_first_proposal', 7200)   // 2h ≤ 4h
    t.setGauge('match_rate', 0.55)                    // 55% ≥ 45%
    t.setGauge('payout_eta_breach_rate', 0.005)       // 0.5% < 1%
    t.setGauge('accessibility_aa_pass_rate', 0.97)    // 97% ≥ 95%
    const s = t.getRagScorecard()
    assert.equal(s.all_green, true)
    assert.equal(s.verdict, 'EXIT_READY')
  })

  it('getRagScorecard has evaluated_at timestamp', () => {
    const t = createKpiTracker()
    const s = t.getRagScorecard()
    assert.ok(s.evaluated_at)
    assert.ok(new Date(s.evaluated_at).getTime() > 0)
  })

  it('setGauge throws KPI_UNKNOWN for invalid key', () => {
    const t = createKpiTracker()
    assert.throws(
      () => t.setGauge('invalid_kpi_key', 0.5),
      (e) => e.code === 'KPI_UNKNOWN'
    )
  })
})
