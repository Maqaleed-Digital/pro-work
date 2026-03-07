'use strict';

const { createCandidateService, InMemoryCandidateStore }    = require('./candidate_service');
const { createRequisitionService, InMemoryRequisitionStore } = require('./requisition_service');
const { createMatchingEngine, InMemoryMatchStore }           = require('./matching_engine');

function createRecruitingModule({ hooks }) {
  const candidateStore    = new InMemoryCandidateStore();
  const requisitionStore  = new InMemoryRequisitionStore();
  const matchStore        = new InMemoryMatchStore();

  const candidateService   = createCandidateService({ store: candidateStore, hooks });
  const requisitionService = createRequisitionService({ store: requisitionStore, hooks });
  const matchingEngine     = createMatchingEngine({ matchStore, hooks });

  return {
    candidateService,
    requisitionService,
    matchingEngine,
    stores: {
      candidateStore,
      requisitionStore,
      matchStore,
    },
  };
}

module.exports = {
  createRecruitingModule,
};
