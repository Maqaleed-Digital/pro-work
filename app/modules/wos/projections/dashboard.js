'use strict';

/**
 * WOS Dashboard Projection — Sprint A
 *
 * Subscribes to domain events and builds a per-tenant read model
 * for the WOS dashboard. Designed for in-memory use; can be
 * reconstructed from the domain_events table at any time.
 *
 * Handled events:
 *   PROJECT_CREATED         → +1 project_count
 *   WORKSTREAM_CREATED      → +1 workstream_count
 *   MILESTONE_CREATED       → +1 milestone_open_count
 *   MILESTONE_COMPLETED     → milestone_open_count--, +1 milestone_completed_count
 *   EXECUTION_JOB_COMPLETED → +1 execution_job_completed_count
 */

function defaultState(tenant_id) {
  return {
    tenant_id,
    project_count:                 0,
    workstream_count:              0,
    milestone_open_count:          0,
    milestone_completed_count:     0,
    execution_job_completed_count: 0,
    last_event_id:   null,
    last_event_type: null,
    last_event_at:   null,
    updated_at:      null,
  };
}

class InMemoryDashboardStore {
  constructor() { this.state = new Map(); }

  get(tenant_id) {
    return this.state.get(tenant_id) || defaultState(tenant_id);
  }

  set(tenant_id, snapshot) {
    this.state.set(tenant_id, snapshot);
    return snapshot;
  }

  listAll() {
    return Array.from(this.state.values());
  }
}

const HANDLERS = {
  PROJECT_CREATED(state) {
    return { ...state, project_count: state.project_count + 1 };
  },
  WORKSTREAM_CREATED(state) {
    return { ...state, workstream_count: state.workstream_count + 1 };
  },
  MILESTONE_CREATED(state) {
    return { ...state, milestone_open_count: state.milestone_open_count + 1 };
  },
  MILESTONE_COMPLETED(state) {
    return {
      ...state,
      milestone_open_count:      Math.max(0, state.milestone_open_count - 1),
      milestone_completed_count: state.milestone_completed_count + 1,
    };
  },
  EXECUTION_JOB_COMPLETED(state) {
    return {
      ...state,
      execution_job_completed_count: state.execution_job_completed_count + 1,
    };
  },
};

function createDashboardProjection({ store }) {
  if (!store) throw new Error('store is required');

  return {
    apply(event) {
      const handler = HANDLERS[event.event_type];
      if (!handler) return;

      const tenant_id = event.tenant_id;
      const current   = store.get(tenant_id);
      const next      = handler(current);

      store.set(tenant_id, {
        ...next,
        last_event_id:   event.event_id,
        last_event_type: event.event_type,
        last_event_at:   event.occurred_at,
        updated_at:      new Date().toISOString(),
      });
    },

    getState(tenant_id) {
      return store.get(tenant_id);
    },

    listAll() {
      return store.listAll();
    },

    // Rebuild from an array of events (replay)
    rebuild(events) {
      for (const event of events) {
        this.apply(event);
      }
    },
  };
}

module.exports = {
  createDashboardProjection,
  InMemoryDashboardStore,
  defaultState,
  HANDLED_EVENT_TYPES: Object.keys(HANDLERS),
};
