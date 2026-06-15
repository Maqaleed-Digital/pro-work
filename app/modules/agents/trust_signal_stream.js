'use strict';

function emitTrustSignal(type, payload) {
  return {
    signal_type: type,
    payload,
    emitted_at: new Date().toISOString()
  };
}

module.exports = emitTrustSignal;
