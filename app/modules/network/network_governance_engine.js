class NetworkGovernanceEngine {
  constructor() {
    this.nodes = new Map()
  }

  registerNode(nodeId, endpoint) {
    this.nodes.set(nodeId, endpoint)
    return {
      node_id: nodeId,
      registered: true
    }
  }

  getNode(nodeId) {
    return this.nodes.get(nodeId) || null
  }
}

module.exports = new NetworkGovernanceEngine()
