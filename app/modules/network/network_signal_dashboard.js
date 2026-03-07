function generateNetworkSignal(signalType) {
  return {
    signal: signalType,
    generated_at: new Date().toISOString()
  }
}

module.exports = generateNetworkSignal
