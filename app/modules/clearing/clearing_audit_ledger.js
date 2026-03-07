class ClearingAuditLedger {
  constructor() {
    this.entries = []
  }

  append(entry) {
    this.entries.push(entry)

    return {
      appended: true,
      entry_count: this.entries.length
    }
  }

  list() {
    return this.entries
  }
}

module.exports = new ClearingAuditLedger()
