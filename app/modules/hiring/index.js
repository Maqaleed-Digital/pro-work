'use strict';

const { createCompensationService, InMemoryCompensationStore } = require('./compensation_service');
const { createOfferService,        InMemoryOfferStore        } = require('./offer_service');
const { createApprovalService,     InMemoryApprovalStore     } = require('./approval_service');
const { createAcceptanceService,   InMemoryAcceptanceStore   } = require('./acceptance_service');
const { createDecisionService,     InMemoryDecisionStore     } = require('./decision_service');

function createHiringModule({ hooks }) {
  return {
    compensationService: createCompensationService({ store: new InMemoryCompensationStore(), hooks }),
    offerService:        createOfferService(       { store: new InMemoryOfferStore(),        hooks }),
    approvalService:     createApprovalService(    { store: new InMemoryApprovalStore(),     hooks }),
    acceptanceService:   createAcceptanceService(  { store: new InMemoryAcceptanceStore(),   hooks }),
    decisionService:     createDecisionService(    { store: new InMemoryDecisionStore(),     hooks }),
  };
}

module.exports = { createHiringModule };
