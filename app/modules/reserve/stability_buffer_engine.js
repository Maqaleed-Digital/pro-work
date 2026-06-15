'use strict';

function normalizeNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('INVALID_NON_NEGATIVE_NUMBER');
  }
  return n;
}

function evaluateBuffer(input) {
  const totalExposure = normalizeNumber(input.total_exposure);
  const reserveBalance = normalizeNumber(input.reserve_balance);
  const targetCoverageRatio = normalizeNumber(
    input.target_coverage_ratio != null ? input.target_coverage_ratio : 1
  );

  const requiredBuffer = Number((totalExposure * targetCoverageRatio).toFixed(6));
  const coverageRatio =
    requiredBuffer === 0 ? 1 : Number((reserveBalance / requiredBuffer).toFixed(6));
  const bufferGap = Number(Math.max(requiredBuffer - reserveBalance, 0).toFixed(6));

  let healthStatus = 'HEALTHY';
  if (coverageRatio < 0.75) {
    healthStatus = 'CRITICAL';
  } else if (coverageRatio < 1) {
    healthStatus = 'WARNING';
  }

  return {
    total_exposure: totalExposure,
    reserve_balance: reserveBalance,
    target_coverage_ratio: targetCoverageRatio,
    required_buffer: requiredBuffer,
    coverage_ratio: coverageRatio,
    buffer_gap: bufferGap,
    health_status: healthStatus
  };
}

module.exports = {
  evaluateBuffer
};
