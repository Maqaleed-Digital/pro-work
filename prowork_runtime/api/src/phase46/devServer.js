const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  getCommandCenterState,
  getOpportunities,
  getOpportunityById,
  getDecisionAudit,
  getBoardQueue,
  getEvents,
  createIntake,
  advanceOpportunityStage,
  approveOpportunity,
  rejectOpportunity
} = require("./governedHandlers");

const PORT = Number(process.env.PHASE46_PORT || "43146");
const DEMO_DIR = path.resolve(__dirname, "../../../web/phase46_demo");

function send(res, payload) {
  res.writeHead(payload.statusCode, payload.headers);
  res.end(payload.body);
}

function sendText(res, statusCode, contentType, body) {
  res.writeHead(statusCode, { "content-type": contentType });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function serveFile(res, fileName, contentType) {
  const filePath = path.join(DEMO_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return sendText(res, 404, "text/plain; charset=utf-8", "Not found");
  }
  return sendText(res, 200, contentType, fs.readFileSync(filePath, "utf8"));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendText(res, 200, "application/json; charset=utf-8", JSON.stringify({
      ok: true,
      phase: "46",
      mode: "option-c-hybrid"
    }, null, 2));
  }

  if (req.method === "GET" && url.pathname === "/api/command-center/state") {
    return send(res, getCommandCenterState());
  }

  if (req.method === "GET" && url.pathname === "/api/opportunities") {
    return send(res, getOpportunities());
  }

  if (req.method === "GET" && /^\/api\/opportunities\/[^/]+\/decisions$/.test(url.pathname)) {
    const parts = url.pathname.split("/");
    const opportunityId = parts[3];
    return send(res, getDecisionAudit(opportunityId));
  }

  if (req.method === "GET" && /^\/api\/opportunities\/[^/]+$/.test(url.pathname)) {
    const opportunityId = url.pathname.split("/").pop();
    return send(res, getOpportunityById(opportunityId));
  }

  if (req.method === "POST" && /^\/api\/opportunities\/[^/]+\/advance$/.test(url.pathname)) {
    const parts = url.pathname.split("/");
    const opportunityId = parts[3];
    try {
      const body = await readJson(req);
      return send(res, advanceOpportunityStage(opportunityId, body, req.headers));
    } catch (error) {
      return sendText(res, 400, "application/json; charset=utf-8", JSON.stringify({
        ok: false, code: "BAD_REQUEST", data: null, errors: [{ message: error.message }], meta: {}
      }, null, 2));
    }
  }

  if (req.method === "POST" && /^\/api\/opportunities\/[^/]+\/approve$/.test(url.pathname)) {
    const parts = url.pathname.split("/");
    const opportunityId = parts[3];
    try {
      const body = await readJson(req);
      return send(res, approveOpportunity(opportunityId, body, req.headers));
    } catch (error) {
      return sendText(res, 400, "application/json; charset=utf-8", JSON.stringify({
        ok: false, code: "BAD_REQUEST", data: null, errors: [{ message: error.message }], meta: {}
      }, null, 2));
    }
  }

  if (req.method === "POST" && /^\/api\/opportunities\/[^/]+\/reject$/.test(url.pathname)) {
    const parts = url.pathname.split("/");
    const opportunityId = parts[3];
    try {
      const body = await readJson(req);
      return send(res, rejectOpportunity(opportunityId, body, req.headers));
    } catch (error) {
      return sendText(res, 400, "application/json; charset=utf-8", JSON.stringify({
        ok: false, code: "BAD_REQUEST", data: null, errors: [{ message: error.message }], meta: {}
      }, null, 2));
    }
  }

  if (req.method === "POST" && url.pathname === "/api/intake") {
    try {
      const body = await readJson(req);
      return send(res, createIntake(body));
    } catch (error) {
      return sendText(res, 400, "application/json; charset=utf-8", JSON.stringify({
        ok: false, code: "BAD_REQUEST", data: null, errors: [{ message: error.message }], meta: {}
      }, null, 2));
    }
  }

  if (req.method === "GET" && url.pathname === "/api/board/queue") {
    return send(res, getBoardQueue());
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    return send(res, getEvents());
  }

  if (req.method === "GET" && url.pathname === "/phase46-demo") {
    return serveFile(res, "index.html", "text/html; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/phase46-demo/app.js") {
    return serveFile(res, "app.js", "application/javascript; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/phase46-demo/styles.css") {
    return serveFile(res, "styles.css", "text/css; charset=utf-8");
  }

  return sendText(res, 404, "application/json; charset=utf-8", JSON.stringify({
    ok: false, code: "NOT_FOUND", data: null,
    errors: [{ message: "Route not found", path: url.pathname }], meta: {}
  }, null, 2));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`PHASE46_SERVER_READY http://127.0.0.1:${PORT}`);
});
