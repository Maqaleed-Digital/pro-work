function coordinateAgents(agentIds) {
  return {
    coordinated_agents: agentIds.length,
    status: "coordinated",
    coordinated_at: new Date().toISOString()
  }
}

module.exports = coordinateAgents
