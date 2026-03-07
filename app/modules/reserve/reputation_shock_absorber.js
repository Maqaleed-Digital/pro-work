'use strict';

function normalizeNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) {
    throw new Error('INVALID_NUMBER');
  }
  return n;
}

function absorbShock(input) {
  const rawDelta = normalizeNumber(input.raw_delta || 0);
  const baselineVolatility = Math.max(normalizeNumber(input.baseline_volatility || 0), 0);
  const shockThreshold = Math.max(normalizeNumber(input.shock_threshold != null ? input.shock_threshold : 20), 0);

  const magnitude = Math.abs(rawDelta);
  const shockDetected = magnitude >= shockThreshold;

  let severity = 'NONE';
  let dampeningFactor = 1;
  const containmentActions = [];

  if (shockDetected) {
    if (magnitude >= shockThreshold * 2 || baselineVolatility > 0.5) {
      severity = 'SEVERE';
      dampeningFactor = 0.25;
      containmentActions.push('TRIGGER_CONTAINMENT_REVIEW', 'TEMPORARY_REPUTATION_DAMPENING');
    } else {
      severity = 'MODERATE';
      dampeningFactor = 0.5;
      containmentActions.push('APPLY_DAMPENING');
    }
  }

  const stabilizedDelta = Number((rawDelta * dampeningFactor).toFixed(6));

  return {
    shock_detected: shockDetected,
    severity,
    dampening_factor: dampeningFactor,
    stabilized_delta: stabilizedDelta,
    containment_actions: containmentActions
  };
}

module.exports = {
  absorbShock
};
