'use strict';

class FederatedTrustRegistry {
  constructor() {
    this.nodes = new Map();
  }

  register(nodeId, endpoint) {
    this.nodes.set(nodeId, endpoint);
    return { registered: true, node_id: nodeId };
  }

  get(nodeId) {
    return this.nodes.get(nodeId) || null;
  }
}

module.exports = new FederatedTrustRegistry();
