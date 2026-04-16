'use strict';

function policyRouter(req, res) {
  if (req.url === '/verification/policy/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', module: 'verifier_policy' }));
    return;
  }
}

module.exports = policyRouter;
