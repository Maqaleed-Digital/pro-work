'use strict';

function json(status, body) {
  return { status, body };
}

function createRecruitingRouter({ recruiting }) {
  return {
    async handle(req) {
      const method = req.method;
      const path   = req.path;

      if (method === 'POST' && path === '/recruiting/candidates') {
        return json(201, await recruiting.candidateService.createCandidate(req.body));
      }

      if (method === 'GET' && path === '/recruiting/candidates') {
        return json(200, await recruiting.candidateService.listCandidates());
      }

      if (method === 'POST' && path === '/recruiting/requisitions') {
        return json(201, await recruiting.requisitionService.createRequisition(req.body));
      }

      if (method === 'GET' && path === '/recruiting/requisitions') {
        return json(200, await recruiting.requisitionService.listRequisitions());
      }

      if (method === 'POST' && path === '/recruiting/requisitions/transition') {
        return json(200, await recruiting.requisitionService.transitionStatus(req.body));
      }

      if (method === 'POST' && path === '/recruiting/match') {
        return json(200, await recruiting.matchingEngine.rankCandidates(req.body));
      }

      if (method === 'POST' && path === '/recruiting/shortlist') {
        return json(200, await recruiting.matchingEngine.shortlistCandidate(req.body));
      }

      return json(404, { error: 'NOT_FOUND', path, method });
    },
  };
}

module.exports = {
  createRecruitingRouter,
};
