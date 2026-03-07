'use strict';

function fabricRouter(req, res) {
  if (req.url === '/fabric/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', module: 'trust_fabric' }));
    return;
  }
}

module.exports = fabricRouter;
