'use strict';

// VERITAS transport interface. The forwarder hands a built event here;
// the transport is responsible for getting it to the VERITAS Pub/Sub topic.
//
// Default: noopTransport (zero behavior change). The forwarder is wired
// behind this until a real Pub/Sub transport ships in a follow-up. This
// matches the Sponsor Ruling expectation that the WorkCaptain PR delivers
// the wireable adapter — not GCP credentials or topic provisioning.

function noopTransport() {
  return {
    name: 'noop',
    async publish(_event) {
      return { delivered: false, reason: 'noop' };
    },
  };
}

function loggingTransport({ logger = console } = {}) {
  return {
    name: 'logging',
    async publish(event) {
      logger.error('[veritas:forward]', JSON.stringify({
        event_id:        event.event_id,
        event_timestamp: event.event_timestamp,
        event_class:     event.event_class,
        mode:            event.mode,
        outcome:         event.outcome,
        severity:        event.severity,
      }));
      return { delivered: true, reason: 'logged' };
    },
  };
}

// Captures events to memory. Test-only.
function memoryTransport() {
  const captured = [];
  return {
    name: 'memory',
    captured,
    async publish(event) {
      captured.push(event);
      return { delivered: true, reason: 'captured' };
    },
  };
}

module.exports = {
  noopTransport,
  loggingTransport,
  memoryTransport,
};
