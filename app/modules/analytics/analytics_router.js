'use strict';

const analyticsService = require('./analytics_service');
const eriEngine = require('../eri/eri_engine');

function analyticsRouter(req, res) {
  if (req.url === '/analytics/metrics') {
    const metrics = analyticsService.getMetrics();
    const eri = eriEngine.calculateERI(metrics);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ metrics, eri }));
    return;
  }
}

module.exports = analyticsRouter;
