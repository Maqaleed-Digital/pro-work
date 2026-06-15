function networkRouter(req, res) {
  if (req.url === "/network/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({
      status: "ok",
      module: "network_orchestration"
    }))
    return
  }
}

module.exports = networkRouter
