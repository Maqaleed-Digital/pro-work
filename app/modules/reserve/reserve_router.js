'use strict';

function createReserveRouter() {
  function getHealth() {
    return {
      ok: true,
      layer: 'reserve',
      status: 'healthy'
    };
  }

  function route(req, res) {
    const method = req.method;
    const url = req.url || '';

    if (method === 'GET' && (url === '/reserve/health' || url.startsWith('/reserve/health?'))) {
      const body = JSON.stringify(getHealth());
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(body);
      return true;
    }

    return false;
  }

  return {
    route,
    getHealth
  };
}

module.exports = {
  createReserveRouter
};
