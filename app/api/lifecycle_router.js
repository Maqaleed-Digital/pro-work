'use strict';

function json(status, body) {
  return { status, body };
}

function createLifecycleRouter({ lifecycle }) {
  return {
    async handle(req) {
      const { method, path, body } = req;

      if (method === 'POST' && path === '/lifecycle/status') {
        return json(200, await lifecycle.lifecycleService.changeWorkerStatus(body));
      }
      if (method === 'POST' && path === '/lifecycle/alerts') {
        return json(201, await lifecycle.lifecycleService.raiseAlert(body));
      }
      if (method === 'POST' && path === '/lifecycle/esb/calculate') {
        return json(200, await lifecycle.esbPolicyEngine.calculate(body));
      }
      if (method === 'POST' && path === '/offboarding/initiate') {
        return json(201, await lifecycle.offboardingService.initiateCase(body));
      }
      if (method === 'POST' && path === '/offboarding/checklist/complete') {
        return json(200, await lifecycle.offboardingService.completeChecklistItem(body));
      }
      if (method === 'POST' && path === '/offboarding/handover') {
        return json(201, await lifecycle.handoverService.record(body));
      }
      if (method === 'POST' && path === '/offboarding/final-settlement/complete') {
        return json(200, await lifecycle.offboardingService.completeFinalSettlementChecklist(body));
      }
      if (method === 'POST' && path === '/offboarding/evidence-pack') {
        return json(200, await lifecycle.offboardingService.generateEvidencePack(body));
      }
      if (method === 'POST' && path === '/offboarding/complete') {
        return json(200, await lifecycle.offboardingService.completeOffboarding(body));
      }

      return json(404, { error: 'NOT_FOUND', path, method });
    }
  };
}

module.exports = {
  createLifecycleRouter
};
