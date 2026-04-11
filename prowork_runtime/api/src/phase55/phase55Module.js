function createPhase55Module(config) {
  const { resolveState } = config;

  function generateRecommendations(opportunityId, state) {
    const recs = [];
    const workItems = state.workItems.filter(w => w.opportunityId === opportunityId);
    const evidence = state.evidencePacks.filter(e => e.opportunityId === opportunityId);
    const certs = state.certifications.filter(c => c.opportunityId === opportunityId);

    if (workItems.some(w => w.status !== "COMPLETED")) {
      recs.push({ type: "COMPLETE_WORK_ITEMS", reason: "Work items incomplete" });
    }

    if (evidence.length === 0) {
      recs.push({ type: "CREATE_EVIDENCE_PACK", reason: "No evidence pack exists" });
    }

    if (certs.length === 0) {
      recs.push({ type: "ISSUE_CERTIFICATION", reason: "No certification exists" });
    }

    if (recs.length >= 2) {
      recs.push({ type: "ESCALATE_TO_BOARD", reason: "Multiple governance gaps detected" });
    }

    return recs;
  }

  function portfolioRecommendations(state) {
    return state.opportunities.map(o => ({
      opportunityId: o.opportunityId,
      recommendations: generateRecommendations(o.opportunityId, state)
    }));
  }

  function jsonOk(res, code, data) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, code, data, errors: [], meta: {} }, null, 2));
  }

  async function route(req, res, pathname) {
    if (req.method !== "GET") return false;
    const state = resolveState();

    if (pathname === "/api/board/recommendations") {
      jsonOk(res, "RECOMMENDATIONS_FETCHED", portfolioRecommendations(state));
      return true;
    }

    if (pathname.startsWith("/api/board/recommendations/")) {
      const id = pathname.split("/").pop();
      jsonOk(res, "RECOMMENDATIONS_DETAIL_FETCHED", generateRecommendations(id, state));
      return true;
    }

    return false;
  }

  return { route };
}

module.exports = { createPhase55Module };
