const http = require("http");
const { readState } = require("./governedStore");
const handlers = require("./governedHandlers");

const PORT = 43150;

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { resolve({}); }
    });
    req.on("error", reject);
  });
}

function send(res, result) {
  res.writeHead(result.statusCode, result.headers);
  res.end(result.body);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-actor-id, x-actor-role");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const { method, url } = req;
  let m;

  try {
    // Health
    if (method === "GET" && url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, phase: 50, port: PORT }));
      return;
    }

    // State
    if (method === "GET" && url === "/api/state") {
      const state = readState();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(state, null, 2));
      return;
    }

    // Intakes
    if (method === "POST" && url === "/api/intakes") {
      const body = await parseBody(req);
      send(res, handlers.createIntake(body));
      return;
    }

    if (method === "GET" && url === "/api/intakes") {
      const state = readState();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, code: "INTAKE_LIST_FETCHED", data: { items: state.intakes, count: state.intakes.length } }));
      return;
    }

    // Opportunities
    if (method === "GET" && url === "/api/opportunities") {
      send(res, handlers.getOpportunities());
      return;
    }

    if (method === "GET" && (m = url.match(/^\/api\/opportunities\/([^/]+)$/))) {
      send(res, handlers.getOpportunityById(m[1]));
      return;
    }

    if (method === "POST" && (m = url.match(/^\/api\/opportunities\/([^/]+)\/advance$/))) {
      const body = await parseBody(req);
      send(res, handlers.advanceOpportunityStage(m[1], body, req.headers));
      return;
    }

    if (method === "POST" && (m = url.match(/^\/api\/opportunities\/([^/]+)\/approve$/))) {
      const body = await parseBody(req);
      send(res, handlers.approveOpportunity(m[1], body, req.headers));
      return;
    }

    if (method === "POST" && (m = url.match(/^\/api\/opportunities\/([^/]+)\/reject$/))) {
      const body = await parseBody(req);
      send(res, handlers.rejectOpportunity(m[1], body, req.headers));
      return;
    }

    // Work Items (under opportunities)
    if (method === "POST" && (m = url.match(/^\/api\/opportunities\/([^/]+)\/work-items$/))) {
      const body = await parseBody(req);
      send(res, handlers.createWorkItem(m[1], body, req.headers));
      return;
    }

    // Work Item transitions — specific before generic
    if (method === "POST" && (m = url.match(/^\/api\/work-items\/([^/]+)\/start$/))) {
      send(res, handlers.startWorkItem(m[1], req.headers));
      return;
    }

    if (method === "POST" && (m = url.match(/^\/api\/work-items\/([^/]+)\/block$/))) {
      send(res, handlers.blockWorkItem(m[1], req.headers));
      return;
    }

    if (method === "POST" && (m = url.match(/^\/api\/work-items\/([^/]+)\/complete$/))) {
      send(res, handlers.completeWorkItem(m[1], req.headers));
      return;
    }

    // Delivery artifacts under work items — specific before generic
    if (method === "POST" && (m = url.match(/^\/api\/work-items\/([^/]+)\/delivery-artifacts$/))) {
      const body = await parseBody(req);
      send(res, handlers.createDeliveryArtifact(m[1], body, req.headers));
      return;
    }

    if (method === "GET" && (m = url.match(/^\/api\/work-items\/([^/]+)\/delivery-artifacts$/))) {
      send(res, handlers.getDeliveryArtifactsForWorkItem(m[1]));
      return;
    }

    // Work Items generic
    if (method === "GET" && url === "/api/work-items") {
      send(res, handlers.getExecutionQueue());
      return;
    }

    if (method === "GET" && (m = url.match(/^\/api\/work-items\/([^/]+)$/))) {
      send(res, handlers.getWorkItemById(m[1]));
      return;
    }

    // Evidence packs under delivery artifacts — specific before generic
    if (method === "POST" && (m = url.match(/^\/api\/delivery-artifacts\/([^/]+)\/evidence-packs$/))) {
      const body = await parseBody(req);
      send(res, handlers.createEvidencePack(m[1], body, req.headers));
      return;
    }

    if (method === "GET" && (m = url.match(/^\/api\/delivery-artifacts\/([^/]+)\/evidence-packs$/))) {
      send(res, handlers.getEvidencePacksForDeliveryArtifact(m[1]));
      return;
    }

    // Delivery Artifacts generic
    if (method === "GET" && url === "/api/delivery-artifacts") {
      send(res, handlers.getDeliveryArtifacts());
      return;
    }

    if (method === "GET" && (m = url.match(/^\/api\/delivery-artifacts\/([^/]+)$/))) {
      send(res, handlers.getDeliveryArtifactById(m[1]));
      return;
    }

    // Evidence Packs generic
    if (method === "GET" && url === "/api/evidence-packs") {
      send(res, handlers.getEvidencePacks());
      return;
    }

    if (method === "GET" && (m = url.match(/^\/api\/evidence-packs\/([^/]+)$/))) {
      send(res, handlers.getEvidencePackById(m[1]));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, code: "NOT_FOUND" }));
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, code: "INTERNAL_ERROR", error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Phase 50 dev server running on port ${PORT}`);
});
