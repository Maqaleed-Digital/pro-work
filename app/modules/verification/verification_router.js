'use strict';

function verificationRouter(req, res) {
  if (req.url === '/verification/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', module: 'verification' }));
    return;
  }
}

module.exports = verificationRouter;
