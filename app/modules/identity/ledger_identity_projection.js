'use strict';

function projectLedgerEvents(events) {
  const credentials = [];

  for (const e of events) {
    if (e.type === 'PROJECT_COMPLETED') {
      credentials.push({
        credential_type: 'PROJECT_COMPLETION_TOKEN',
        subject: e.user_id,
        source_event: e.event_id
      });
    }
    if (e.type === 'PHR_APPROVED') {
      credentials.push({
        credential_type: 'PHR_APPROVAL_TOKEN',
        subject: e.user_id,
        source_event: e.event_id
      });
    }
  }

  return credentials;
}

module.exports = projectLedgerEvents;
