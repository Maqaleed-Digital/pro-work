'use strict';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) {
    throw new Error('INVALID_NUMBER');
  }
  return n;
}

function evaluateNetworkConfidence(input) {
  const disputeRate = clamp(normalizeNumber(input.dispute_rate || 0), 0, 1);
  const reconciliationDelay = Math.max(normalizeNumber(input.reconciliation_delay || 0), 0);
  const reserveCoverageRatio = Math.max(normalizeNumber(input.reserve_coverage_ratio || 0), 0);
  const rewardVolatility = clamp(normalizeNumber(input.reward_volatility || 0), 0, 1);
  const jurisdictionStabilityFactor = clamp(
    normalizeNumber(input.jurisdiction_stability_factor != null ? input.jurisdiction_stability_factor : 1),
    0,
    1
  );

  const disputePenalty = disputeRate * 30;
  const delayPenalty = Math.min(reconciliationDelay, 10) * 2;
  const volatilityPenalty = rewardVolatility * 20;
  const reserveSupport = Math.min(reserveCoverageRatio, 1.5) * 20;
  const jurisdictionSupport = jurisdictionStabilityFactor * 20;

  const confidenceScore = clamp(
    Number((100 - disputePenalty - delayPenalty - volatilityPenalty + reserveSupport + jurisdictionSupport - 20).toFixed(2)),
    0,
    100
  );

  let confidenceBand = 'HIGH';
  if (confidenceScore < 50) {
    confidenceBand = 'LOW';
  } else if (confidenceScore < 75) {
    confidenceBand = 'MEDIUM';
  }

  const contributingFactors = [
    { factor: 'dispute_rate', value: disputeRate, effect: -disputePenalty },
    { factor: 'reconciliation_delay', value: reconciliationDelay, effect: -delayPenalty },
    { factor: 'reserve_coverage_ratio', value: reserveCoverageRatio, effect: reserveSupport },
    { factor: 'reward_volatility', value: rewardVolatility, effect: -volatilityPenalty },
    { factor: 'jurisdiction_stability_factor', value: jurisdictionStabilityFactor, effect: jurisdictionSupport }
  ];

  const recommendedActions = [];
  if (disputeRate > 0.2) recommendedActions.push('REDUCE_DISPUTE_RATE');
  if (reconciliationDelay > 3) recommendedActions.push('ACCELERATE_RECONCILIATION');
  if (reserveCoverageRatio < 1) recommendedActions.push('INCREASE_RESERVE_COVERAGE');
  if (rewardVolatility > 0.25) recommendedActions.push('DAMPEN_REWARD_VOLATILITY');
  if (recommendedActions.length === 0) recommendedActions.push('MAINTAIN_CURRENT_CONTROLS');

  return {
    confidence_score: confidenceScore,
    confidence_band: confidenceBand,
    contributing_factors: contributingFactors,
    recommended_actions: recommendedActions
  };
}

module.exports = {
  evaluateNetworkConfidence
};
