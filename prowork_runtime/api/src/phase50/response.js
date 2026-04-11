function envelope(ok, code, data, errors = [], meta = {}) {
  return { ok, code, data, errors, meta };
}
function json(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body, null, 2) };
}
function ok(code, data, meta = {}) { return json(200, envelope(true, code, data, [], meta)); }
function created(code, data, meta = {}) { return json(201, envelope(true, code, data, [], meta)); }
function rejected(statusCode, code, errors, meta = {}) { return json(statusCode, envelope(false, code, null, errors, meta)); }
module.exports = { envelope, json, ok, created, rejected };
