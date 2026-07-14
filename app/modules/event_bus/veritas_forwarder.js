'use strict';

// VERITAS forwarder — wraps the existing event publisher so that internal
// events on the approved whitelist are additionally shipped to VERITAS in
// the eight-attribute contract.
//
// Sponsor Ruling (31 May 2026), authority WORKCAPTAIN_INTEGRATION_BRIEF:
// - Event-bus forwarder approved at THIS path (no emit calls inside
//   business-logic services like checklist_service.js / matching_engine.js).
// - Whitelist is EXACT — silent additions are a leak risk.
// - WorkCaptain remains Mode-D; the forwarder always tags mode="D" via
//   contract.js. Mode-D events MUST NEVER reach the CERTUS Trust Ledger;
//   the transport here only delivers to VERITAS.
// - Failures in forwarding MUST NOT change publisher behaviour.

const { createEventPublisher } = require('./index');
const { mapInternalToVeritas, WHITELIST } = require('./veritas/contract');
const { noopTransport } = require('./veritas/transport');

function createVeritasForwardingPublisher({ eventStore, transport, onForwardError }) {
  const base = createEventPublisher({ eventStore });
  const veritasTransport = transport || noopTransport();

  return {
    async publish(event) {
      const persisted = await base.publish(event);
      forwardIfWhitelisted(persisted, veritasTransport, onForwardError);
      return persisted;
    },
  };
}

// Fire-and-forget forwarding. Errors are isolated from the caller.
function forwardIfWhitelisted(internalEvent, transport, onForwardError) {
  if (!WHITELIST[internalEvent.event_type]) return;
  let veritasEvent;
  try {
    veritasEvent = mapInternalToVeritas(internalEvent);
  } catch (mapErr) {
    if (onForwardError) onForwardError(mapErr, internalEvent);
    return;
  }
  if (!veritasEvent) return;
  try {
    const p = transport.publish(veritasEvent);
    if (p && typeof p.then === 'function') {
      p.catch(err => { if (onForwardError) onForwardError(err, internalEvent); });
    }
  } catch (publishErr) {
    if (onForwardError) onForwardError(publishErr, internalEvent);
  }
}

module.exports = {
  createVeritasForwardingPublisher,
  forwardIfWhitelisted,
  WHITELIST,
};
