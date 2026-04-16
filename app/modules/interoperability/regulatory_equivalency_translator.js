function translateRegulatoryEquivalency(sourceRule, targetJurisdiction) {
  return {
    source_rule: sourceRule,
    target_jurisdiction: targetJurisdiction,
    translated_rule: sourceRule + "_FOR_" + targetJurisdiction,
    translated_at: new Date().toISOString()
  }
}

module.exports = translateRegulatoryEquivalency
