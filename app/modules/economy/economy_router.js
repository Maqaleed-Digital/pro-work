'use strict';

function economyRouter(req, res) {
  if (req.url === '/economy/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', module: 'credential_economy' }));
    return;
  }
}

module.exports = economyRouter;
