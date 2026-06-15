'use strict';

function createExecutionEventHooks({ publisher, clock = () => new Date().toISOString() }) {
  if (!publisher || typeof publisher.publish !== 'function') {
    throw new Error('publisher.publish(event) is required');
  }

  function baseEnvelope({
    event_id,
    event_type,
    tenant_id,
    aggregate_type,
    aggregate_id,
    actor,
    correlation_id,
    causation_id,
    sourceModule,
    trust_level,
    requires_approval,
    payload,
    metadata = {},
  }) {
    return {
      event_id,
      event_type,
      event_version: '1.0',
      occurred_at: clock(),
      tenant_id,
      aggregate_type,
      aggregate_id,
      actor,
      correlation_id,
      causation_id,
      source: {
        service: 'execution_engine',
        module: sourceModule,
        environment: process.env.NODE_ENV || 'development',
      },
      trust_level,
      requires_approval,
      payload,
      metadata,
    };
  }

  return {
    emitProjectCreated(args) {
      return publisher.publish(baseEnvelope({
        ...args,
        event_type: 'PROJECT_CREATED',
        aggregate_type: 'PROJECT',
        sourceModule: 'projects',
        trust_level: 'STANDARD',
        requires_approval: false,
      }));
    },

    emitWorkstreamCreated(args) {
      return publisher.publish(baseEnvelope({
        ...args,
        event_type: 'WORKSTREAM_CREATED',
        aggregate_type: 'WORKSTREAM',
        sourceModule: 'workstreams',
        trust_level: 'STANDARD',
        requires_approval: false,
      }));
    },

    emitMilestoneCreated(args) {
      return publisher.publish(baseEnvelope({
        ...args,
        event_type: 'MILESTONE_CREATED',
        aggregate_type: 'MILESTONE',
        sourceModule: 'milestones',
        trust_level: 'STANDARD',
        requires_approval: false,
      }));
    },

    emitExecutionJobCompleted(args) {
      return publisher.publish(baseEnvelope({
        ...args,
        event_type: 'EXECUTION_JOB_COMPLETED',
        aggregate_type: 'EXECUTION_JOB',
        sourceModule: 'execution_jobs',
        trust_level: 'STANDARD',
        requires_approval: Boolean(args.payload && args.payload.requires_approval),
      }));
    },

    emitDeliverableApproved(args) {
      return publisher.publish(baseEnvelope({
        ...args,
        event_type: 'DELIVERABLE_APPROVED',
        aggregate_type: 'DELIVERABLE',
        sourceModule: 'deliverables',
        trust_level: 'HIGH',
        requires_approval: false,
      }));
    },

    emitMilestoneCompleted(args) {
      return publisher.publish(baseEnvelope({
        ...args,
        event_type: 'MILESTONE_COMPLETED',
        aggregate_type: 'MILESTONE',
        sourceModule: 'milestones',
        trust_level: 'HIGH',
        requires_approval: false,
      }));
    },

    // Sprint A additions
    emitExecutionJobCreated(args) {
      return publisher.publish(baseEnvelope({
        ...args,
        event_type: 'EXECUTION_JOB_CREATED',
        aggregate_type: 'EXECUTION_JOB',
        sourceModule: 'execution_jobs',
        trust_level: 'STANDARD',
        requires_approval: false,
      }));
    },

    emitDeliverableSubmitted(args) {
      return publisher.publish(baseEnvelope({
        ...args,
        event_type: 'DELIVERABLE_SUBMITTED',
        aggregate_type: 'DELIVERABLE',
        sourceModule: 'deliverables',
        trust_level: 'STANDARD',
        requires_approval: false,
      }));
    },
  };
}

module.exports = {
  createExecutionEventHooks,
};
