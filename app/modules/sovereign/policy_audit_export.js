function generatePolicyAuditExport(policyId, entries) {
  return {
    policy_id: policyId,
    entry_count: Array.isArray(entries) ? entries.length : 0,
    generated_at: new Date().toISOString()
  }
}

module.exports = generatePolicyAuditExport
