'use strict';

const { createLifecycleService, InMemoryLifecycleStore } = require('./lifecycle_service');
const { createEsbPolicyEngine } = require('./esb_policy_engine');
const { createOffboardingService, InMemoryOffboardingStore } = require('./offboarding_service');
const { createHandoverService, InMemoryHandoverStore } = require('./handover_service');

/**
 * createLifecycleModule({ hooks, evidencePackSvc? })
 *
 * evidencePackSvc is optional (S39-G6 wiring 3).
 * When provided, OFFBOARDING_EVIDENCE_PACK_GENERATED events are intercepted
 * and the pack is persisted to the real evidence pack store.
 */
function createLifecycleModule({ hooks, evidencePackSvc }) {
  // S39-G6 wiring 3: wrap hooks.publish to intercept evidence pack events
  const wrappedHooks = evidencePackSvc && typeof evidencePackSvc.createPack === 'function'
    ? {
        publish(event) {
          if (event.event_type === 'OFFBOARDING_EVIDENCE_PACK_GENERATED' && event.payload) {
            const p = event.payload
            if (p.evidence_pack_id && p.offboarding_case_id) {
              try {
                evidencePackSvc.createPack({
                  evidence_pack_id:    p.evidence_pack_id,
                  offboarding_case_id: p.offboarding_case_id,
                  worker_id:           event.payload.worker_id || null,
                  tenant_id:           event.tenant_id || null,
                  handover_count:      p.handover_count || 0,
                  generated_at:        event.occurred_at || new Date().toISOString(),
                  metadata:            event.metadata || {},
                })
              } catch (e) {
                // non-fatal — evidence pack store failure should not block offboarding
                console.error('evidence pack wiring error:', e.message)
              }
            }
          }
          return hooks.publish(event)
        }
      }
    : hooks

  return {
    lifecycleService:   createLifecycleService({ store: new InMemoryLifecycleStore(), hooks: wrappedHooks }),
    esbPolicyEngine:    createEsbPolicyEngine({ hooks: wrappedHooks }),
    offboardingService: createOffboardingService({ store: new InMemoryOffboardingStore(), hooks: wrappedHooks }),
    handoverService:    createHandoverService({ store: new InMemoryHandoverStore(), hooks: wrappedHooks }),
  };
}

module.exports = {
  createLifecycleModule
};
