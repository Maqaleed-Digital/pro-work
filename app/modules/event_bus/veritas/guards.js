'use strict';

// Fire-and-forget VERITAS emit for governance-exception sites (event 6).
//
// Sponsor Ruling (31 May 2026): emit BEFORE the existing throw, swallow all
// emit failures, leave the original error path (throw type, message, timing)
// untouched. Scoping line: emit only for Mode, authority, policy, classification,
// or execution-boundary guard violations. Ordinary validation / missing fields /
// user-input errors / expected business-rule rejection do NOT emit.
//
// The transport is resolved lazily so that import has no side effects and
// callers can swap the transport for tests via setTransport().

const { buildGovernanceExceptionEvent } = require('./contract');
const { noopTransport } = require('./transport');

let _transport = noopTransport();

function setTransport(t) {
  _transport = t || noopTransport();
}

function getTransport() {
  return _transport;
}

// Fire-and-forget. Synchronous return, async publish, all errors swallowed.
// Never throws. Never returns rejected promise.
function emitGovernanceException(ctx) {
  let event;
  try {
    event = buildGovernanceExceptionEvent(ctx);
  } catch (_buildErr) {
    return;
  }
  try {
    const p = _transport.publish(event);
    if (p && typeof p.then === 'function') {
      p.catch(() => { /* swallow */ });
    }
  } catch (_publishErr) {
    // swallow
  }
}

module.exports = {
  emitGovernanceException,
  setTransport,
  getTransport,
};
