function createPhase60Module(config) {
  const { resolveProductionState } = config;

  function json(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body, null, 2));
  }

  async function route(req, res, pathname) {
    if (
      pathname !== "/api/production/live-verification" &&
      pathname !== "/api/production/go-live-certification"
    ) {
      return false;
    }

    const state = resolveProductionState();

    if (pathname === "/api/production/live-verification") {
      json(res, 200, {
        ok: true,
        code: "PRODUCTION_LIVE_VERIFICATION_FETCHED",
        data: {
          deploymentStatus: state.deploymentStatus,
          liveVerification: state.liveVerification || "NOT_RUN",
          verifiedAt: state.verifiedAt || null,
          verificationEvidencePath: state.verificationEvidencePath || null
        },
        errors: [],
        meta: {}
      });
      return true;
    }

    if (pathname === "/api/production/go-live-certification") {
      json(res, 200, {
        ok: true,
        code: "PRODUCTION_GO_LIVE_CERTIFICATION_FETCHED",
        data: {
          deploymentStatus: state.deploymentStatus,
          goLiveCertification: state.goLiveCertification || "NOT_ISSUED",
          certifiedAt: state.certifiedAt || null,
          verificationEvidencePath: state.verificationEvidencePath || null
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

module.exports = { createPhase60Module };
