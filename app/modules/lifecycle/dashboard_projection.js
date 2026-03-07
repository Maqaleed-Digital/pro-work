'use strict';

function applyEvent(state, event) {
  const next = JSON.parse(JSON.stringify(state || {
    workers_by_status: {},
    active_offboarding_cases: 0,
    alerts: 0
  }));

  if (event.event_type === 'WORKER_STATUS_CHANGED') {
    next.workers_by_status[event.payload.next_status] = (next.workers_by_status[event.payload.next_status] || 0) + 1;
  }

  if (event.event_type === 'OFFBOARDING_INITIATED') {
    next.active_offboarding_cases += 1;
  }

  if (event.event_type === 'OFFBOARDING_COMPLETED') {
    next.active_offboarding_cases = Math.max(0, next.active_offboarding_cases - 1);
  }

  if (event.event_type === 'LIFECYCLE_ALERT_RAISED') {
    next.alerts += 1;
  }

  return next;
}

module.exports = {
  applyEvent
};
