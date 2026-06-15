'use strict';

const crypto = require('crypto');

function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function computePayloadDigest(payload) {
  return sha256(canonicalStringify(payload));
}

function computeLedgerEntryHash({ event_id, event_type, aggregate_id, payload_digest, prev_hash }) {
  return sha256(`${event_id}|${event_type}|${aggregate_id}|${payload_digest}|${prev_hash || ''}`);
}

module.exports = {
  canonicalStringify,
  computePayloadDigest,
  computeLedgerEntryHash,
};
