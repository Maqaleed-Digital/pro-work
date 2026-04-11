const fs = require("fs");
const path = require("path");

function createPhase52Module(config) {
  const { resolveState } = config;

  function buildPortfolioSummary(state) {
    const totalOpportunities = state.opportunities.length;
    const totalWorkItems = state.workItems.length;
    const totalArtifacts = state.deliveryArtifacts.length;
    const totalEvidence = state.evidencePacks.length;
    const totalCertifications = state.certifications.length;

    const closed = state.evidencePacks.filter(e => e.status === "CLOSED").length;

    return {
      totals: {
        opportunities: totalOpportunities,
        workItems: totalWorkItems,
        deliveryArtifacts: totalArtifacts,
        evidencePacks: totalEvidence,
        certifications: totalCertifications
      },
      closure: {
        closedEvidencePacks: closed,
        closureRate: totalEvidence > 0 ? closed / totalEvidence : 0
      }
    };
  }

  async function route(req, res, pathname) {
    const state = resolveState();

    if (pathname === "/api/board/assurance") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({
        ok: true,
        code: "BOARD_ASSURANCE_FETCHED",
        data: buildPortfolioSummary(state),
        errors: [],
        meta: {}
      }, null, 2));
    }

    if (pathname.startsWith("/api/board/assurance/")) {
      const id = pathname.split("/").pop();
      const opportunity = state.opportunities.find(o => o.opportunityId === id);

      if (!opportunity) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify({ ok: false, code: "OPPORTUNITY_NOT_FOUND", data: null, errors: [{ field: "opportunityId", message: "Opportunity not found" }], meta: {} }, null, 2));
      }

      const relatedWork = state.workItems.filter(w => w.opportunityId === id);
      const relatedEvidence = state.evidencePacks.filter(e => e.opportunityId === id);
      const relatedCert = state.certifications.filter(c => c.opportunityId === id);

      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({
        ok: true,
        code: "BOARD_ASSURANCE_DETAIL_FETCHED",
        data: { opportunity, workItems: relatedWork, evidencePacks: relatedEvidence, certifications: relatedCert },
        errors: [],
        meta: {}
      }, null, 2));
    }

    if (pathname === "/api/board/portfolio/closure-summary") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({
        ok: true,
        code: "PORTFOLIO_CLOSURE_SUMMARY_FETCHED",
        data: buildPortfolioSummary(state),
        errors: [],
        meta: {}
      }, null, 2));
    }

    return false;
  }

  return { route };
}

module.exports = { createPhase52Module };
