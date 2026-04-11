function createPhase53Module(config) {
  const { resolveState } = config;

  function detectAnomalies(state) {
    const anomalies = [];

    // Missing certification
    state.evidencePacks.forEach(ep => {
      const hasCert = state.certifications.find(c => c.evidencePackId === ep.evidencePackId);
      if (!hasCert) {
        anomalies.push({ type: "MISSING_CERTIFICATION", evidencePackId: ep.evidencePackId });
      }
    });

    // Work items not completed
    state.workItems.forEach(w => {
      if (w.status !== "COMPLETED") {
        anomalies.push({ type: "WORK_ITEM_NOT_COMPLETED", workItemId: w.workItemId });
      }
    });

    // Delivery artifacts without evidence packs
    state.deliveryArtifacts.forEach(da => {
      const hasEp = state.evidencePacks.find(ep => ep.deliveryArtifactId === da.deliveryArtifactId);
      if (!hasEp) {
        anomalies.push({ type: "DELIVERY_WITHOUT_EVIDENCE_PACK", deliveryArtifactId: da.deliveryArtifactId });
      }
    });

    return anomalies;
  }

  function generateInsights(state) {
    const anomalies = detectAnomalies(state);
    return {
      totalAnomalies: anomalies.length,
      critical: anomalies.filter(a => a.type === "MISSING_CERTIFICATION").length,
      warnings: anomalies.filter(a => a.type !== "MISSING_CERTIFICATION").length,
      summary: {
        opportunities: state.opportunities.length,
        workItems: state.workItems.length,
        completedWorkItems: state.workItems.filter(w => w.status === "COMPLETED").length,
        deliveryArtifacts: state.deliveryArtifacts.length,
        evidencePacks: state.evidencePacks.length,
        certifications: state.certifications.length
      }
    };
  }

  function jsonOk(res, code, data) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, code, data, errors: [], meta: {} }, null, 2));
  }

  async function route(req, res, pathname) {
    if (req.method !== "GET") return false;
    const state = resolveState();

    if (pathname === "/api/board/insights") {
      jsonOk(res, "BOARD_INSIGHTS_FETCHED", generateInsights(state));
      return true;
    }

    if (pathname === "/api/board/anomalies") {
      jsonOk(res, "BOARD_ANOMALIES_FETCHED", detectAnomalies(state));
      return true;
    }

    return false;
  }

  return { route };
}

module.exports = { createPhase53Module };
