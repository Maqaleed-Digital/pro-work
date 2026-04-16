'use strict';

function json(status, body) {
  return { status, body };
}

function createOnboardingRouter({ onboarding }) {
  return {
    async handle(req) {
      const { method, path, body } = req;

      if (method === 'POST' && path === '/onboarding/start')
        return json(201, await onboarding.checklistService.startOnboarding(body));

      if (method === 'POST' && path === '/onboarding/checklist/items')
        return json(201, await onboarding.checklistService.createChecklistItem(body));

      if (method === 'POST' && path === '/onboarding/checklist/complete')
        return json(200, await onboarding.checklistService.completeChecklistItem(body));

      if (method === 'POST' && path === '/onboarding/documents')
        return json(201, await onboarding.documentService.createDocument(body));

      if (method === 'POST' && path === '/onboarding/documents/verify')
        return json(200, await onboarding.documentService.verifyDocument(body));

      if (method === 'POST' && path === '/onboarding/contracts/draft')
        return json(201, await onboarding.contractService.draftContract(body));

      if (method === 'POST' && path === '/onboarding/contracts/transition')
        return json(200, await onboarding.contractService.transitionContract(body));

      if (method === 'POST' && path === '/onboarding/consents/ack')
        return json(201, await onboarding.consentService.acknowledgeConsent(body));

      if (method === 'POST' && path === '/onboarding/compliance/iban')
        return json(200, await onboarding.complianceService.captureIban(body));

      if (method === 'POST' && path === '/onboarding/compliance/wps')
        return json(200, await onboarding.complianceService.generateWpsReadiness(body));

      if (method === 'POST' && path === '/onboarding/probation/open')
        return json(201, await onboarding.probationService.openProbationCase(body));

      if (method === 'POST' && path === '/onboarding/probation/day80')
        return json(200, await onboarding.probationService.generateDay80Pack(body));

      if (method === 'POST' && path === '/onboarding/probation/decision')
        return json(200, await onboarding.probationService.recordDecision(body));

      return json(404, { error: 'NOT_FOUND', path, method });
    },
  };
}

module.exports = { createOnboardingRouter };
