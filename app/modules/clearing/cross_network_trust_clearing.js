function clearTrustAcrossNetworks(sourceNetwork, targetNetwork, amount) {
  return {
    source_network: sourceNetwork,
    target_network: targetNetwork,
    cleared_amount: amount,
    cleared_at: new Date().toISOString()
  }
}

module.exports = clearTrustAcrossNetworks
