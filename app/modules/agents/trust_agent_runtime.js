'use strict';

class TrustAgentRuntime {
  constructor() {
    this.agents = new Map();
  }

  start(agentId) {
    this.agents.set(agentId, { status: 'running' });
    return { agent_id: agentId, status: 'running' };
  }

  status(agentId) {
    return this.agents.get(agentId) || { status: 'unknown' };
  }
}

module.exports = new TrustAgentRuntime();
