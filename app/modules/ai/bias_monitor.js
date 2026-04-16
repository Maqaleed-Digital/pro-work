'use strict';

// S36-G1: AI Governance — Bias Monitor
// BRD Refs: Gold BRD A4, WOS §11.3
// Rule: bias monitoring NEVER blocks a recommendation — log and flag only.

// Signal keys considered sensitive under KSA PDPL / fair-hiring policy.
// Configurable: replace with policy asset import when compliance config layer exists.
const SENSITIVE_SIGNAL_KEYS = [
  'nationality',
  'gender',
  'age',
  'date_of_birth',
  'marital_status',
  'religion',
  'ethnicity',
];

// Threshold above which a sensitive signal is considered a PRIMARY driver.
// Primary = its weight or presence is the dominant factor in the recommendation.
const PRIMARY_DRIVER_THRESHOLD = 0.5;

/**
 * Determine whether a signal key is sensitive.
 * @param {string} key
 * @returns {boolean}
 */
function isSensitiveKey(key) {
  const normalised = key.toLowerCase();
  return SENSITIVE_SIGNAL_KEYS.some((s) => normalised === s || normalised.startsWith(s + '_'));
}

/**
 * Compute a bias score for a set of input signals.
 *
 * Scoring logic:
 * - Find all sensitive signal keys present in the input.
 * - For each, determine its weight (explicit `weight` property, or 1/N of total signals).
 * - Bias score = sum of weights of sensitive signals, clamped to [0.00, 1.00].
 * - If any single sensitive signal has weight > PRIMARY_DRIVER_THRESHOLD, the
 *   result is flagged as a primary driver.
 *
 * @param {Object} signals - key/value map of input signals, values may include
 *   a `weight` field (0–1) or be plain scalar values.
 * @returns {{ biasScore: number, flagged: boolean, sensitiveSignals: string[], primaryDrivers: string[] }}
 */
function computeBiasScore(signals) {
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)) {
    return { biasScore: 0.00, flagged: false, sensitiveSignals: [], primaryDrivers: [] };
  }

  const keys = Object.keys(signals);
  const totalKeys = keys.length || 1;
  const defaultWeight = 1 / totalKeys;

  const sensitiveSignals = [];
  const primaryDrivers = [];
  let totalSensitiveWeight = 0;

  for (const key of keys) {
    if (!isSensitiveKey(key)) continue;

    sensitiveSignals.push(key);

    const val = signals[key];
    const weight =
      val !== null && typeof val === 'object' && typeof val.weight === 'number'
        ? Math.max(0, Math.min(1, val.weight))
        : defaultWeight;

    totalSensitiveWeight += weight;

    if (weight > PRIMARY_DRIVER_THRESHOLD) {
      primaryDrivers.push(key);
    }
  }

  const biasScore = Math.min(1.00, parseFloat(totalSensitiveWeight.toFixed(2)));
  const flagged = sensitiveSignals.length > 0;

  return { biasScore, flagged, sensitiveSignals, primaryDrivers };
}

module.exports = { computeBiasScore, isSensitiveKey, SENSITIVE_SIGNAL_KEYS };
