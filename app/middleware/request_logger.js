'use strict';

function requestLogger(req, res, next) {
  const entry = {
    ts: new Date().toISOString(),
    method: req.method,
    url: req.url
  };

  console.log(JSON.stringify(entry));

  if (typeof next === 'function') {
    next();
  }
}

module.exports = requestLogger;
