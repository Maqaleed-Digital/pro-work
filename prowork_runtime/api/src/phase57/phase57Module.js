const fs = require("fs");
const path = require("path");

function createPhase57Module(config) {
  const { resolveState } = config;

  const usageFile = path.join(__dirname, "../../data/phase57-usage.json");

  function readUsage() {
    try {
      return JSON.parse(fs.readFileSync(usageFile, "utf8"));
    } catch {
      return [];
    }
  }

  function writeUsage(data) {
    fs.mkdirSync(path.dirname(usageFile), { recursive: true });
    fs.writeFileSync(usageFile + ".tmp", JSON.stringify(data, null, 2));
    fs.renameSync(usageFile + ".tmp", usageFile);
  }

  function recordUsage(tenantId, route) {
    const usage = readUsage();
    usage.push({ tenantId, route, ts: new Date().toISOString() });
    writeUsage(usage);
  }

  function json(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body, null, 2));
  }

  async function route(req, res, pathname) {
    if (!pathname.startsWith("/api/external") && pathname !== "/api/usage" && pathname !== "/api/tenants") {
      return false;
    }

    if (pathname.startsWith("/api/external")) {
      const tenantId = req.headers["x-tenant-id"];
      if (!tenantId) {
        json(res, 400, { ok: false, code: "TENANT_REQUIRED", errors: ["x-tenant-id header is required"], meta: {} });
        return true;
      }

      const state = resolveState();

      if (pathname === "/api/external/health") {
        recordUsage(tenantId, pathname);
        json(res, 200, { ok: true, code: "EXTERNAL_HEALTH_OK", data: { tenantId }, errors: [], meta: {} });
        return true;
      }

      if (pathname === "/api/external/opportunities") {
        recordUsage(tenantId, pathname);
        const data = state.opportunities.filter(o => o.tenantId === tenantId);
        json(res, 200, { ok: true, code: "EXTERNAL_OPPORTUNITIES_FETCHED", data, errors: [], meta: {} });
        return true;
      }

      return false;
    }

    if (pathname === "/api/usage") {
      json(res, 200, { ok: true, code: "USAGE_FETCHED", data: readUsage(), errors: [], meta: {} });
      return true;
    }

    if (pathname === "/api/tenants") {
      const state = resolveState();
      const tenants = [...new Set(state.opportunities.map(o => o.tenantId).filter(Boolean))];
      json(res, 200, { ok: true, code: "TENANTS_FETCHED", data: tenants, errors: [], meta: {} });
      return true;
    }

    return false;
  }

  return { route };
}

module.exports = { createPhase57Module };
