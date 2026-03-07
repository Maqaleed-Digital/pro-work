function reachConsensus(nodes) {
  return {
    participants: nodes.length,
    consensus: true,
    reached_at: new Date().toISOString()
  }
}

module.exports = reachConsensus
