const http = require("http")
const url = require("url")

const port = Number(process.env.APP_PORT || process.env.PORT || 3010)

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  })
  res.end(body)
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8"
  })
  res.end(text)
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url || "", true)
  const pathname = parsed.pathname || "/"

  if (pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "pro-work-app",
      ts: new Date().toISOString(),
      port
    })
  }

  if (pathname === "/") {
    return sendText(res, 200, "ProWork App — S10 Genesis OK\n")
  }

  return sendJson(res, 404, { ok: false, error: "not_found", path: pathname })
})

server.listen(port, "127.0.0.1", () => {
  console.log(`server running on http://127.0.0.1:${port}`)
})
