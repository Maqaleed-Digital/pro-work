function resolveJurisdictionOverlay(jurisdiction) {
  return {
    jurisdiction,
    overlay: jurisdiction + "_OVERLAY",
    resolved_at: new Date().toISOString()
  }
}

module.exports = resolveJurisdictionOverlay
