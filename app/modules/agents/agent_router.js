'use strict';

function agentRouter(req, res) {
  if (req.url === '/agents/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', module: 'trust_agents' }));
    return;
  }
}

module.exports = agentRouter;
