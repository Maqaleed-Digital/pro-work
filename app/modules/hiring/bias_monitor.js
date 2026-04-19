'use strict'

const rubric = require('../../config/ai/matching_rubric_v1.json')

const THRESHOLD = rubric.disparateImpactThreshold || 0.8
const MONITORED = new Set(rubric.biasMonitoredDimensions || [])

/**
 * S43-G4: Bias monitor — disparate impact analysis.
 *
 * Evaluates a ranked candidate list for disparate impact
 * across monitored dimensions (nationality, gender, age_band).
 * Does NOT use these dimensions for scoring — monitoring only.
 *
 * @param {Array} rankedList — scored candidates with metadata
 * @param {Object} poolMetadata — { dimension: { group: count } }
 * @returns {{ disparateImpact: Object, flagged: boolean, flags: Array }}
 */
function evaluateRankingBias(rankedList, poolMetadata) {
  const threshold = rubric.minimumMatchThreshold || 40
  const recommended = rankedList.filter(c => c.match_score >= threshold)
  const notRecommended = rankedList.filter(c => c.match_score < threshold)

  const result = {
    total_candidates: rankedList.length,
    recommended_count: recommended.length,
    not_recommended_count: notRecommended.length,
    disparate_impact: {},
    flagged: false,
    flags: [],
    rubric_version: rubric.version,
  }

  for (const dim of MONITORED) {
    const poolGroups = (poolMetadata && poolMetadata[dim]) || {}
    const groupNames = Object.keys(poolGroups)
    if (groupNames.length < 2) continue

    // Selection rate per group
    const rates = {}
    for (const group of groupNames) {
      const inPool = poolGroups[group] || 0
      const selected = recommended.filter(c => {
        const val = c.metadata && c.metadata[dim]
        return val === group
      }).length
      rates[group] = inPool > 0 ? selected / inPool : 0
    }

    // Find highest rate
    const maxRate = Math.max(...Object.values(rates))

    // 4/5ths rule: ratio of each group's rate to the highest
    const ratios = {}
    for (const [group, rate] of Object.entries(rates)) {
      ratios[group] = maxRate > 0 ? rate / maxRate : 1
    }

    result.disparate_impact[dim] = {
      selection_rates: rates,
      impact_ratios: ratios,
      max_rate: maxRate,
    }

    // Flag if any ratio < threshold
    for (const [group, ratio] of Object.entries(ratios)) {
      if (ratio < THRESHOLD) {
        result.flagged = true
        result.flags.push({
          dimension: dim,
          group,
          ratio: Math.round(ratio * 1000) / 1000,
          threshold: THRESHOLD,
          message: `${dim}:${group} selection rate ratio ${(ratio * 100).toFixed(1)}% is below ${THRESHOLD * 100}% threshold`,
        })
      }
    }
  }

  return result
}

module.exports = { evaluateRankingBias, THRESHOLD, MONITORED }
