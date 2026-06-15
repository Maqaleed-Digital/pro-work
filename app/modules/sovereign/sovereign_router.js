function sovereignRouter(req, res) {
  if (req.url === "/sovereign/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({
      status: "ok",
      module: "sovereign_governance"
    }))
    return
  }
}

module.exports = sovereignRouter
