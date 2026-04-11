function createPhase61Module(config) {
  const { resolveProductionState, resolveHypercareState } = config;

  function json(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body, null, 2));
  }

  async function route(req, res, pathname) {
    if (
      pathname !== "/api/operations/hypercare/status" &&
      pathname !== "/api/operations/hypercare/summary" &&
      pathname !== "/api/operations/hypercare/rollback-readiness"
    ) {
      return false;
    }

    const production = resolveProductionState();
    const hypercare = resolveHypercareState();

    if (pathname === "/api/operations/hypercare/status") {
      json(res, 200, {
        ok: true,
        code: "HYPERCARE_STATUS_FETCHED",
        data: {
          deploymentStatus: production.deploymentStatus,
          hypercareState: hypercare.hypercareState,
          owner: hypercare.owner,
          activatedAt: hypercare.activatedAt || null,
          stableAt: hypercare.stableAt || null,
          incidentState: hypercare.incidentState,
          lastUpdatedAt: hypercare.lastUpdatedAt
        },
        errors: [],
        meta: {}
      });
      return true;
    }

    if (pathname === "/api/operations/hypercare/summary") {
      json(res, 200, {
        ok: true,
        code: "HYPERCARE_SUMMARY_FETCHED",
        data: {
          deploymentStatus: production.deploymentStatus,
          hypercareState: hypercare.hypercareState,
          windowDays: hypercare.windowDays,
          incidentChannel: hypercare.incidentChannel,
          statusPageUrl: hypercare.statusPageUrl,
          rollbackOwner: hypercare.rollbackOwner
        },
        errors: [],
        meta: {}
      });
      return true;
    }

    if (pathname === "/api/operations/hypercare/rollback-readiness") {
      json(res, 200, {
        ok: true,
        code: "ROLLBACK_READINESS_FETCHED",
        data: {
          rollbackReady: hypercare.rollbackReady,
          rollbackOwner: hypercare.rollbackOwner,
          rollbackRunbookPresent: hypercare.rollbackRunbookPresent,
          currentHypercareState: hypercare.hypercareState,
          lastEvaluatedAt: hypercare.lastEvaluatedAt
        },
        errors: [],
        meta: {}
      });
      return true;
    }

    return false;
  }

  return { route };
}

module.exports = { createPhase61Module };
