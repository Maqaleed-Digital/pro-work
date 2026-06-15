'use strict';

/**
 * WOS Core — Sprint A barrel + service factory
 *
 * Usage (in-memory, event-wired):
 *
 *   const { createWosCore } = require('./app/modules/wos');
 *   const { createEventPublisher, InMemoryEventStore } = require('./app/modules/event_bus');
 *   const { createExecutionEventHooks } = require('./app/modules/execution_engine/event_hooks');
 *
 *   const eventStore = new InMemoryEventStore();
 *   const publisher  = createEventPublisher({ eventStore });
 *   const hooks      = createExecutionEventHooks({ publisher });
 *
 *   const wos = createWosCore({ hooks });
 *
 *   const project = await wos.projects.create({ ... });
 */

const { createWorkerService,    InMemoryWorkerStore    } = require('./worker_service');
const { createPodService,       InMemoryPodStore       } = require('./pod_service');
const { createAssignmentService, InMemoryAssignmentStore } = require('./assignment_service');
const { createProjectService,   InMemoryProjectStore   } = require('./project_service');
const { createWorkstreamService, InMemoryWorkstreamStore } = require('./workstream_service');
const { createMilestoneService, InMemoryMilestoneStore  } = require('./milestone_service');
const { createExecutionJobService, InMemoryExecutionJobStore } = require('./execution_job_service');

function createWosCore({ hooks, stores = {} } = {}) {
  const workerStore      = stores.workers      || new InMemoryWorkerStore();
  const podStore         = stores.pods         || new InMemoryPodStore();
  const assignmentStore  = stores.assignments  || new InMemoryAssignmentStore();
  const projectStore     = stores.projects     || new InMemoryProjectStore();
  const workstreamStore  = stores.workstreams  || new InMemoryWorkstreamStore();
  const milestoneStore   = stores.milestones   || new InMemoryMilestoneStore();
  const executionJobStore = stores.executionJobs || new InMemoryExecutionJobStore();

  const workerService      = createWorkerService({ store: workerStore });
  const podService         = createPodService({ store: podStore });
  const assignmentService  = createAssignmentService({ store: assignmentStore, workerService, podService });
  const projectService     = createProjectService({ store: projectStore, hooks });
  const workstreamService  = createWorkstreamService({ store: workstreamStore, hooks, projectService });
  const milestoneService   = createMilestoneService({ store: milestoneStore, hooks });
  const executionJobService = createExecutionJobService({ store: executionJobStore, hooks });

  return {
    workers:       workerService,
    pods:          podService,
    assignments:   assignmentService,
    projects:      projectService,
    workstreams:   workstreamService,
    milestones:    milestoneService,
    executionJobs: executionJobService,

    // Expose stores for testing / snapshotting
    _stores: {
      workers:       workerStore,
      pods:          podStore,
      assignments:   assignmentStore,
      projects:      projectStore,
      workstreams:   workstreamStore,
      milestones:    milestoneStore,
      executionJobs: executionJobStore,
    },
  };
}

module.exports = {
  createWosCore,
  // Re-export individual factories + stores for selective use
  createWorkerService,      InMemoryWorkerStore,
  createPodService,         InMemoryPodStore,
  createAssignmentService,  InMemoryAssignmentStore,
  createProjectService,     InMemoryProjectStore,
  createWorkstreamService,  InMemoryWorkstreamStore,
  createMilestoneService,   InMemoryMilestoneStore,
  createExecutionJobService, InMemoryExecutionJobStore,
};
