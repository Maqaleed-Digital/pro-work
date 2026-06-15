function settlementRouter(req, res) {
  if (req.url === "/settlement/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({
      status: "ok",
      module: "trust_settlement"
    }))
    return
  }
}

module.exports = settlementRouter
