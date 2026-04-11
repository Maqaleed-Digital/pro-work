const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  getCommandCenterState, getOpportunities, getOpportunityById, getDecisionAudit,
  getBoardQueue, getEvents, getWorkItemsForOpportunity, getWorkItems, getWorkItemById,
  getExecutionQueue, createIntake, advanceOpportunityStage, approveOpportunity,
  rejectOpportunity, createWorkItem, startWorkItem, blockWorkItem, completeWorkItem
} = require("./governedHandlers");

const PORT = Number(process.env.PHASE48_PORT || "43148");
const DEMO_DIR = path.resolve(__dirname, "../../../web/phase48_demo");

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
      if (data.length > 1024 * 1024) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function badRequest(res, message) {
  sendText(res, 400, "application/json; charset=utf-8",
    JSON.stringify({ ok: false, code: "BAD_REQUEST", data: null, errors: [{ message }], meta: {} }, null, 2));
}

function serveFile(res, fileName, contentType) {
  const filePath = path.join(DEMO_DIR, fileName);
  if (!fs.existsSync(filePath)) return sendText(res, 404, "text/plain; charset=utf-8", "Not found");
  return sendText(res, 200, contentType, fs.readFileSync(filePath, "utf8"));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = url.pathname;
  const m = req.method;

  if (m === "GET" && p === "/health") {
    return sendText(res, 200, "application/json; charset=utf-8",
      JSON.stringify({ ok: true, phase: "48", mode: "execution-lifecycle" }, null, 2));
  }

  if (m === "GET" && p === "/api/command-center/state") return send(res, getCommandCenterState());
  if (m === "GET" && p === "/api/opportunities") return send(res, getOpportunities());
  if (m === "GET" && p === "/api/work-items") return send(res, getWorkItems());
  if (m === "GET" && p === "/api/execution/queue") return send(res, getExecutionQueue());
  if (m === "GET" && p === "/api/board/queue") return send(res, getBoardQueue());
  if (m === "GET" && p === "/api/events") return send(res, getEvents());

  if (m === "GET" && /^\/api\/work-items\/[^/]+$/.test(p)) return send(res, getWorkItemById(p.split("/").pop()));
  if (m === "GET" && /^\/api\/opportunities\/[^/]+\/decisions$/.test(p)) return send(res, getDecisionAudit(p.split("/")[3]));
  if (m === "GET" && /^\/api\/opportunities\/[^/]+\/work-items$/.test(p)) return send(res, getWorkItemsForOpportunity(p.split("/")[3]));
  if (m === "GET" && /^\/api\/opportunities\/[^/]+$/.test(p)) return send(res, getOpportunityById(p.split("/").pop()));

  if (m === "POST" && p === "/api/intake") {
    try { return send(res, createIntake(await readJson(req))); } catch (e) { return badRequest(res, e.message); }
  }
  if (m === "POST" && /^\/api\/opportunities\/[^/]+\/advance$/.test(p)) {
    try { return send(res, advanceOpportunityStage(p.split("/")[3], await readJson(req), req.headers)); } catch (e) { return badRequest(res, e.message); }
  }
  if (m === "POST" && /^\/api\/opportunities\/[^/]+\/approve$/.test(p)) {
    try { return send(res, approveOpportunity(p.split("/")[3], await readJson(req), req.headers)); } catch (e) { return badRequest(res, e.message); }
  }
  if (m === "POST" && /^\/api\/opportunities\/[^/]+\/reject$/.test(p)) {
    try { return send(res, rejectOpportunity(p.split("/")[3], await readJson(req), req.headers)); } catch (e) { return badRequest(res, e.message); }
  }
  if (m === "POST" && /^\/api\/opportunities\/[^/]+\/work-items$/.test(p)) {
    try { return send(res, createWorkItem(p.split("/")[3], await readJson(req), req.headers)); } catch (e) { return badRequest(res, e.message); }
  }

  if (m === "POST" && /^\/api\/work-items\/[^/]+\/start$/.test(p)) return send(res, startWorkItem(p.split("/")[3], req.headers));
  if (m === "POST" && /^\/api\/work-items\/[^/]+\/block$/.test(p)) return send(res, blockWorkItem(p.split("/")[3], req.headers));
  if (m === "POST" && /^\/api\/work-items\/[^/]+\/complete$/.test(p)) return send(res, completeWorkItem(p.split("/")[3], req.headers));

  if (m === "GET" && p === "/phase48-demo") return serveFile(res, "index.html", "text/html; charset=utf-8");
  if (m === "GET" && p === "/phase48-demo/app.js") return serveFile(res, "app.js", "application/javascript; charset=utf-8");
  if (m === "GET" && p === "/phase48-demo/styles.css") return serveFile(res, "styles.css", "text/css; charset=utf-8");

  return sendText(res, 404, "application/json; charset=utf-8",
    JSON.stringify({ ok: false, code: "NOT_FOUND", data: null, errors: [{ message: "Route not found", path: p }], meta: {} }, null, 2));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`PHASE48_SERVER_READY http://127.0.0.1:${PORT}`);
});
