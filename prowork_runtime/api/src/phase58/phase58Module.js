const fs = require("fs");
const path = require("path");

function createPhase58Module(config) {
  const { resolveState } = config;

  const keyFile = path.join(__dirname, "../../data/phase58-api-keys.json");
  const billingFile = path.join(__dirname, "../../data/phase58-billing.json");

  function readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { return []; }
  }

  function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + ".tmp", JSON.stringify(data, null, 2));
    fs.renameSync(file + ".tmp", file);
  }

  function getTenantFromKey(apiKey) {
    const keys = readJson(keyFile);
    const match = keys.find(k => k.apiKey === apiKey);
    return match ? match.tenantId : null;
  }

  function recordBilling(tenantId, route) {
    const logs = readJson(billingFile);
    logs.push({ tenantId, route, units: 1, ts: new Date().toISOString() });
    writeJson(billingFile, logs);
  }

  function json(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body, null, 2));
  }

  async function route(req, res, pathname) {
    if (
      !pathname.startsWith("/api/external/secure") &&
      pathname !== "/api/billing/usage" &&
      pathname !== "/api/billing/summary"
    ) {
      return false;
    }

    if (pathname.startsWith("/api/external/secure")) {
      const apiKey = req.headers["x-api-key"];
      if (!apiKey) {
        json(res, 401, { ok: false, code: "UNAUTHORIZED", errors: ["x-api-key header is required"], meta: {} });
        return true;
      }
      const tenantId = getTenantFromKey(apiKey);
      if (!tenantId) {
        json(res, 401, { ok: false, code: "INVALID_API_KEY", errors: ["API key not recognized"], meta: {} });
        return true;
      }

      recordBilling(tenantId, pathname);

      if (pathname === "/api/external/secure-health") {
        json(res, 200, { ok: true, code: "SECURE_HEALTH_OK", data: { tenantId }, errors: [], meta: {} });
        return true;
      }

      return false;
    }

    if (pathname === "/api/billing/usage") {
      json(res, 200, { ok: true, code: "BILLING_USAGE_FETCHED", data: readJson(billingFile), errors: [], meta: {} });
      return true;
    }

    if (pathname === "/api/billing/summary") {
      const logs = readJson(billingFile);
      const summary = {};
      logs.forEach(l => { summary[l.tenantId] = (summary[l.tenantId] || 0) + l.units; });
      json(res, 200, { ok: true, code: "BILLING_SUMMARY_FETCHED", data: summary, errors: [], meta: {} });
      return true;
    }

    return false;
  }

  return { route };
}

module.exports = { createPhase58Module };
