function createPhase56Module(config) {
  const { resolveState } = config;

  function simulate(opportunityId, action, state) {
    const base = {
      opportunityId,
      action,
      expectedRiskReduction: 0,
      expectedClosureImpact: "NONE",
      expectedCertificationState: "UNCHANGED"
    };

    if (action === "COMPLETE_WORK_ITEMS") {
      return { ...base, expectedRiskReduction: 0.3, expectedClosureImpact: "IMPROVES", expectedCertificationState: "PENDING" };
    }
    if (action === "CREATE_EVIDENCE_PACK") {
      return { ...base, expectedRiskReduction: 0.2, expectedClosureImpact: "PARTIAL", expectedCertificationState: "READY" };
    }
    if (action === "ISSUE_CERTIFICATION") {
      return { ...base, expectedRiskReduction: 0.4, expectedClosureImpact: "CLOSES", expectedCertificationState: "CERTIFIED" };
    }
    if (action === "ESCALATE_TO_BOARD") {
      return { ...base, expectedRiskReduction: 0.1, expectedClosureImpact: "ESCALATED", expectedCertificationState: "REVIEW" };
    }

    return base;
  }

  function jsonOk(res, code, data) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, code, data, errors: [], meta: {} }, null, 2));
  }

  function parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", c => { body += c; });
      req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { resolve({}); } });
      req.on("error", reject);
    });
  }

  async function route(req, res, pathname) {
    const state = resolveState();

    if (req.method === "GET" && pathname.startsWith("/api/board/simulate/")) {
      const id = pathname.replace("/api/board/simulate/", "");
      if (!id) return false;
      jsonOk(res, "SIMULATION_OPTIONS_FETCHED", {
        opportunityId: id,
        supportedActions: [
          "COMPLETE_WORK_ITEMS",
          "CREATE_EVIDENCE_PACK",
          "ISSUE_CERTIFICATION",
          "ESCALATE_TO_BOARD"
        ]
      });
      return true;
    }

    if (req.method === "POST" && pathname.startsWith("/api/board/simulate/")) {
      const id = pathname.replace("/api/board/simulate/", "");
      if (!id) return false;
      const body = await parseBody(req);
      const action = body.action;
      if (!action) {
        res.writeHead(422, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, code: "MISSING_ACTION", errors: ["action is required"], meta: {} }));
        return true;
      }
      jsonOk(res, "SIMULATION_COMPLETE", simulate(id, action, state));
      return true;
    }

    return false;
  }

  return { route };
}

module.exports = { createPhase56Module };
