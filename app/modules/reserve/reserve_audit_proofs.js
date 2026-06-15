'use strict';

const crypto = require('crypto');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }

  const keys = Object.keys(value).sort();
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function generateReserveAuditProof(input) {
  const snapshot = {
    reserve_id: input.reserve_id,
    network_id: input.network_id,
    jurisdiction_id: input.jurisdiction_id,
    total_balance: Number(input.total_balance || 0),
    available_balance: Number(input.available_balance || 0),
    locked_balance: Number(input.locked_balance || 0),
    allocated_balance: Number(input.allocated_balance || 0),
    utilization_ratio: Number(input.utilization_ratio || 0),
    reserve_status: input.reserve_status || 'UNKNOWN',
    generated_at: input.generated_at || '1970-01-01T00:00:00.000Z'
  };

  const canonical = stableStringify(snapshot);
  const proofHash = sha256(canonical);

  return {
    proof_type: 'RESERVE_AUDIT_PROOF',
    proof_hash: proofHash,
    canonical_snapshot: snapshot,
    summary_metrics: {
      total_balance: snapshot.total_balance,
      available_balance: snapshot.available_balance,
      locked_balance: snapshot.locked_balance,
      allocated_balance: snapshot.allocated_balance,
      utilization_ratio: snapshot.utilization_ratio
    }
  };
}

module.exports = {
  generateReserveAuditProof,
  stableStringify
};
