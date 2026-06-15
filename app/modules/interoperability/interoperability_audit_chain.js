function buildInteroperabilityAuditChain(entries) {
  return {
    entry_count: Array.isArray(entries) ? entries.length : 0,
    chain_generated_at: new Date().toISOString()
  }
}

module.exports = buildInteroperabilityAuditChain
