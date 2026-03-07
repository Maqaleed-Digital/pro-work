'use strict';

function analyzeMarket(signal) {
  return {
    analyzed_signal: signal,
    market_health: 'stable',
    analyzed_at: new Date().toISOString()
  };
}

module.exports = analyzeMarket;
