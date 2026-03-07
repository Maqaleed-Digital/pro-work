'use strict';

function json(status, body) {
  return { status, body };
}

function createHiringRouter({ hiring }) {
  return {
    async handle(req) {
      const { method, path, body } = req;

      // Compensation
      if (method === 'POST' && path === '/hiring/compensation/draft')
        return json(201, await hiring.compensationService.draftPackage(body));
      if (method === 'POST' && path === '/hiring/compensation/approve')
        return json(200, await hiring.compensationService.approvePackage(body));
      if (method === 'GET'  && path === '/hiring/compensation')
        return json(200, await hiring.compensationService.listPackages());

      // Offers
      if (method === 'POST' && path === '/hiring/offers')
        return json(201, await hiring.offerService.createOffer(body));
      if (method === 'POST' && path === '/hiring/offers/send')
        return json(200, await hiring.offerService.sendOffer(body));
      if (method === 'POST' && path === '/hiring/offers/withdraw')
        return json(200, await hiring.offerService.withdrawOffer(body));
      if (method === 'GET'  && path === '/hiring/offers')
        return json(200, await hiring.offerService.listOffers());

      // Approvals
      if (method === 'POST' && path === '/hiring/approvals/request')
        return json(201, await hiring.approvalService.requestApproval(body));
      if (method === 'POST' && path === '/hiring/approvals/record')
        return json(200, await hiring.approvalService.recordApproval(body));
      if (method === 'GET'  && path === '/hiring/approvals')
        return json(200, await hiring.approvalService.listApprovals());

      // Candidate acceptance
      if (method === 'POST' && path === '/hiring/acceptance')
        return json(201, await hiring.acceptanceService.recordAcceptance(body));
      if (method === 'GET'  && path === '/hiring/acceptance')
        return json(200, await hiring.acceptanceService.listAcceptances());

      // Hiring decisions
      if (method === 'POST' && path === '/hiring/decisions')
        return json(201, await hiring.decisionService.recordDecision(body));
      if (method === 'GET'  && path === '/hiring/decisions')
        return json(200, await hiring.decisionService.listDecisions());

      return json(404, { error: 'NOT_FOUND', path, method });
    },
  };
}

module.exports = { createHiringRouter };
