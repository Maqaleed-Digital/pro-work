'use strict';

function createLiquidityRouter() {

  function getHealth() {
    return {
      ok: true,
      layer: 'liquidity',
      status: 'healthy'
    };
  }

  function route(req,res) {

    if (req.method === 'GET' && req.url === '/liquidity/health') {

      res.statusCode = 200;
      res.setHeader('content-type','application/json');

      res.end(JSON.stringify(getHealth()));
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
  createLiquidityRouter
};
