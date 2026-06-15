function incentiveRouter(req, res) {
  if (req.url === "/incentives/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({
      status: "ok",
      module: "autonomous_incentives"
    }))
    return
  }
}

module.exports = incentiveRouter
