'use strict';

const db = require('../storage/db');
const { loadRuntimeConfig } = require('../config/runtime_config');

function healthRouter(req, res) {
  if (req.url === '/health' || req.url === '/ready') {
    const config = loadRuntimeConfig();
    const dbStatus = db.status();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: config.service_name,
      node_env: config.node_env,
      database_connected: dbStatus.connected,
      evidence_root: config.evidence_root
    }));
    return;
  }
}

module.exports = healthRouter;
