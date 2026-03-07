'use strict';

function identityRouter(req, res) {
  if (req.url === '/identity/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', module: 'identity' }));
    return;
  }
}

module.exports = identityRouter;
