function interoperabilityRouter(req, res) {
  if (req.url === "/interoperability/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({
      status: "ok",
      module: "cross_jurisdiction_interoperability"
    }))
    return
  }
}

module.exports = interoperabilityRouter
