function clearingRouter(req, res) {
  if (req.url === "/clearing/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({
      status: "ok",
      module: "global_trust_clearing"
    }))
    return
  }
}

module.exports = clearingRouter
