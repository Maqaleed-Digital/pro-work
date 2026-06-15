'use strict';

function exchangeTrustScore(source, target, amount) {
  return {
    from: source,
    to: target,
    transferred_score: amount,
    exchanged_at: new Date().toISOString()
  };
}

module.exports = exchangeTrustScore;
