function createPhase59Module(config) {
  const { resolveProductionState } = config;

  function json(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body, null, 2));
  }

  async function route(req, res, pathname) {
    if (
      pathname !== "/api/production/status" &&
      pathname !== "/api/production/config-check" &&
      pathname !== "/api/production/deployment-summary"
    ) {
      return false;
    }

    const state = resolveProductionState();

    if (pathname === "/api/production/status") {
      json(res, 200, {
        ok: true,
        code: "PRODUCTION_STATUS_FETCHED",
        data: {
          deploymentStatus: state.deploymentStatus,
          serviceName: state.serviceName,
          region: state.region,
          environment: state.environment,
          lastUpdatedAt: state.lastUpdatedAt
        },
        errors: [],
        meta: {}
      });
      return true;
    }

    if (pathname === "/api/production/config-check") {
      json(res, 200, {
        ok: true,
        code: "PRODUCTION_CONFIG_CHECK_FETCHED",
        data: {
          requiredVariablesPresent: state.requiredVariablesPresent,
          missingRequiredVariables: state.missingRequiredVariables,
          configValidated: state.configValidated
        },
        errors: [],
        meta: {}
      });
      return true;
    }

    if (pathname === "/api/production/deployment-summary") {
      json(res, 200, {
        ok: true,
        code: "PRODUCTION_DEPLOYMENT_SUMMARY_FETCHED",
        data: {
          deploymentStatus: state.deploymentStatus,
          baseUrl: state.baseUrl,
          imageUri: state.imageUri,
          projectId: state.projectId,
          serviceName: state.serviceName,
          region: state.region
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

module.exports = { createPhase59Module };
