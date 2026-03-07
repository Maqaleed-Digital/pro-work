'use strict';

const compliance = require('./compliance_service');
const wps = require('./wps_validator');

function complianceRouter(req, res) {
  if (req.url === '/compliance/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', module: 'compliance' }));
    return;
  }
}

module.exports = complianceRouter;
