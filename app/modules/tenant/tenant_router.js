'use strict';

const tenantService = require('./tenant_service');

function tenantRouter(req, res) {
  if (req.url === '/tenant/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', module: 'tenant' }));
    return;
  }
}

module.exports = tenantRouter;
