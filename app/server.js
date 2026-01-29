const http = require("http")
const fs = require("fs")
const path = require("path")

const SERVICE = "pro-work"
const HOST = process.env.APP_HOST || "127.0.0.1"

const preferredPort = Number(process.env.APP_PORT || 3010)

const strictPort =
  String(process.env.STRICT_PORT || "").toLowerCase() === "1" ||
  String(process.env.STRICT_PORT || "").toLowerCase() === "true"

const runtimeDir = path.join(__dirname, ".runtime")
const portFile = path.join(runtimeDir, "port.txt")

function log(line) {
  process.stdout.write(line + "\n")
}

function ensureRuntimeDir() {
  fs.mkdirSync(runtimeDir, { recursive: true })
}

function writeChosenPort(port) {
  ensureRuntimeDir()
  fs.writeFileSync(portFile, String(port), "utf8")
}

function createServer() {
  return http.createServer((req, res) => {
    if (req.url === "/api/health") {
      const body = JSON.stringify({
        ok: true,
        service: SERVICE,
        time: new Date().toISOString(),
        requestId: "req_" + Math.random().toString(16).slice(2),
      })
      res.statusCode = 200
      res.setHeader("content-type", "application/json; charset=utf-8")
      res.end(body)
      return
    }

    res.statusCode = 404
    res.setHeader("content-type", "application/json; charset=utf-8")
    res.end(JSON.stringify({ ok: false, error: "not_found" }))
  })
}

function listenOn(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off("listening", onListening)
      reject(err)
    }
    const onListening = () => {
      server.off("error", onError)
      resolve()
    }

    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(port, HOST)
  })
}

async function main() {
  const server = createServer()

  let chosenPort = preferredPort
  let mode = "preferred"
  let attempts = 0

  if (strictPort) {
    attempts = 1
    await listenOn(server, preferredPort)
    chosenPort = preferredPort
    mode = "strict"
  } else {
    const maxAttempts = Number(process.env.PORT_ATTEMPTS || 25)
    for (let i = 0; i < maxAttempts; i++) {
      attempts++
      const candidate = preferredPort + i
      try {
        await listenOn(server, candidate)
        chosenPort = candidate
        mode = i === 0 ? "preferred" : "fallback"
        break
      } catch (err) {
        if (err && err.code === "EADDRINUSE") continue
        throw err
      }
    }

    if (!server.listening) {
      throw new Error(
        `No free port found starting from ${preferredPort} after ${attempts} attempts`
      )
    }
  }

  writeChosenPort(chosenPort)

  log(`[${SERVICE}] runtime_ok=true`)
  log(`[${SERVICE}] host=${HOST}`)
  log(`[${SERVICE}] preferred_port=${preferredPort}`)
  log(`[${SERVICE}] chosen_port=${chosenPort}`)
  log(`[${SERVICE}] mode=${mode}`)
  log(`[${SERVICE}] attempts=${attempts}`)
  log(`[${SERVICE}] runtime_port_file=${portFile}`)
  log(`[${SERVICE}] health=http://${HOST}:${chosenPort}/api/health`)
}

main().catch((err) => {
  process.stderr.write(`[${SERVICE}] runtime_ok=false\n`)
  process.stderr.write(err && err.stack ? err.stack + "\n" : String(err) + "\n")
  process.exit(1)
})
