const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  getCommandCenterState,
  getOpportunities,
  createIntake
} = require("./governedHandlers");

const PORT = Number(process.env.PHASE44_PORT || "43144");
const DEMO_DIR = path.resolve(__dirname, "../../../web/phase44_demo");

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
    sendText(res, 404, "text/plain; charset=utf-8", "Not found");
    return;
  }
  sendText(res, 200, contentType, fs.readFileSync(filePath, "utf8"));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendText(res, 200, "application/json; charset=utf-8", JSON.stringify({
      ok: true,
      phase: "44",
      mode: "option-c-hybrid"
    }, null, 2));
  }

  if (req.method === "GET" && url.pathname === "/api/command-center/state") {
    return send(res, getCommandCenterState());
  }

  if (req.method === "GET" && url.pathname === "/api/opportunities") {
    return send(res, getOpportunities());
  }

  if (req.method === "POST" && url.pathname === "/api/intake") {
    try {
      const body = await readJson(req);
      return send(res, createIntake(body));
    } catch (error) {
      return sendText(res, 400, "application/json; charset=utf-8", JSON.stringify({
        error: "BAD_REQUEST",
        reason: error.message
      }, null, 2));
    }
  }

  if (req.method === "GET" && url.pathname === "/phase44-demo") {
    return serveFile(res, "index.html", "text/html; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/phase44-demo/app.js") {
    return serveFile(res, "app.js", "application/javascript; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/phase44-demo/styles.css") {
    return serveFile(res, "styles.css", "text/css; charset=utf-8");
  }

  return sendText(res, 404, "application/json; charset=utf-8", JSON.stringify({
    error: "NOT_FOUND",
    path: url.pathname
  }, null, 2));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`PHASE44_SERVER_READY http://127.0.0.1:${PORT}`);
});
