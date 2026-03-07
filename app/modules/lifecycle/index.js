'use strict';

const { createLifecycleService, InMemoryLifecycleStore } = require('./lifecycle_service');
const { createEsbPolicyEngine } = require('./esb_policy_engine');
const { createOffboardingService, InMemoryOffboardingStore } = require('./offboarding_service');
const { createHandoverService, InMemoryHandoverStore } = require('./handover_service');

function createLifecycleModule({ hooks }) {
  return {
    lifecycleService: createLifecycleService({ store: new InMemoryLifecycleStore(), hooks }),
    esbPolicyEngine: createEsbPolicyEngine({ hooks }),
    offboardingService: createOffboardingService({ store: new InMemoryOffboardingStore(), hooks }),
    handoverService: createHandoverService({ store: new InMemoryHandoverStore(), hooks })
  };
}

module.exports = {
  createLifecycleModule
};
