'use strict';

function json(status, body) {
  return { status, body };
}

function createHiringRouter({ hiring }) {
  return {
    async handle(req) {
      const { method, path, body } = req;

      // Hiring cases
      if (method === 'POST' && path === '/hiring/cases')
        return json(201, await hiring.hiringCaseService.openHiringCase(body));
      if (method === 'POST' && path === '/hiring/cases/decision')
        return json(200, await hiring.hiringCaseService.recordDecision(body));
      if (method === 'GET'  && path === '/hiring/cases')
        return json(200, await hiring.hiringCaseService.listCases());

      // Compensation validation
      if (method === 'POST' && path === '/hiring/compensation/validate')
        return json(200, await hiring.compensationService.validateCompensation(body));

      // Approvals
      if (method === 'POST' && path === '/hiring/approvals/request')
        return json(201, await hiring.approvalService.requestApproval(body));
      if (method === 'POST' && path === '/hiring/approvals/approve')
        return json(200, await hiring.approvalService.approveOffer(body));
      if (method === 'GET'  && path === '/hiring/approvals')
        return json(200, await hiring.approvalService.listApprovals());

      // Offers
      if (method === 'POST' && path === '/hiring/offers')
        return json(201, await hiring.offerService.draftOffer(body));
      if (method === 'POST' && path === '/hiring/offers/send')
        return json(200, await hiring.offerService.sendOffer(body));
      if (method === 'GET'  && path === '/hiring/offers')
        return json(200, await hiring.offerService.listOffers());

      // Acceptance
      if (method === 'POST' && path === '/hiring/acceptance/accept')
        return json(200, await hiring.acceptanceService.acceptOffer(body));
      if (method === 'POST' && path === '/hiring/acceptance/decline')
        return json(200, await hiring.acceptanceService.declineOffer(body));

      // Qiwa contract mapping
      if (method === 'POST' && path === '/hiring/qiwa/map')
        return json(200, await hiring.qiwaMappingService.mapContract(body));

      return json(404, { error: 'NOT_FOUND', path, method });
    },
  };
}

module.exports = { createHiringRouter };
