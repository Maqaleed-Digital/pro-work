'use strict';

function generateAuditExport(events) {
  return {
    generated_at: new Date().toISOString(),
    event_count: events.length,
    events
  };
}

module.exports = generateAuditExport;
