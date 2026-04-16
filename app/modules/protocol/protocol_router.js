function protocolRouter(req, res) {
  if (req.url === "/protocol/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({
      status: "ok",
      module: "identity_protocol"
    }))
    return
  }
}

module.exports = protocolRouter
