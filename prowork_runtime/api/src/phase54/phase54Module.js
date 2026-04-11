function createPhase54Module(config) {
  const { resolveState } = config;

  function computeRisk(opportunityId, state) {
    const workItems = state.workItems.filter(w => w.opportunityId === opportunityId);
    const evidence = state.evidencePacks.filter(e => e.opportunityId === opportunityId);
    const certifications = state.certifications.filter(c => c.opportunityId === opportunityId);

    let riskScore = 0;
    const drivers = [];

    if (workItems.length === 0) {
      riskScore += 0.3;
      drivers.push("NO_WORK_ITEMS");
    }

    const incomplete = workItems.filter(w => w.status !== "COMPLETED").length;
    if (incomplete > 0) {
      riskScore += 0.3;
      drivers.push("INCOMPLETE_WORK_ITEMS");
    }

    if (evidence.length === 0) {
      riskScore += 0.2;
      drivers.push("NO_EVIDENCE_PACK");
    }

    if (certifications.length === 0) {
      riskScore += 0.2;
      drivers.push("NO_CERTIFICATION");
    }

    if (riskScore > 1) riskScore = 1;

    let level = "LOW";
    if (riskScore >= 0.7) level = "HIGH";
    else if (riskScore >= 0.4) level = "MEDIUM";

    return { opportunityId, riskScore, riskLevel: level, drivers };
  }

  function portfolioForecast(state) {
    return state.opportunities.map(o => computeRisk(o.opportunityId, state));
  }

  function jsonOk(res, code, data) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, code, data, errors: [], meta: {} }, null, 2));
  }

  async function route(req, res, pathname) {
    if (req.method !== "GET") return false;
    const state = resolveState();

    if (pathname === "/api/board/risk-forecast") {
      jsonOk(res, "RISK_FORECAST_FETCHED", portfolioForecast(state));
      return true;
    }

    if (pathname.startsWith("/api/board/risk-forecast/")) {
      const id = pathname.split("/").pop();
      jsonOk(res, "RISK_FORECAST_DETAIL_FETCHED", computeRisk(id, state));
      return true;
    }

    return false;
  }

  return { route };
}

module.exports = { createPhase54Module };
