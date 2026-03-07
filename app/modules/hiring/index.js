'use strict';

const { createHiringCaseService, InMemoryHiringCaseStore } = require('./hiring_case_service');
const { createCompensationService                        } = require('./compensation_service');
const { createApprovalService,     InMemoryApprovalStore } = require('./approval_service');
const { createOfferService,        InMemoryOfferStore    } = require('./offer_service');
const { createAcceptanceService                          } = require('./acceptance_service');
const { createQiwaMappingService                         } = require('./qiwa_mapping_service');

function createHiringModule({ hooks }) {
  return {
    hiringCaseService:   createHiringCaseService( { store: new InMemoryHiringCaseStore(), hooks }),
    compensationService: createCompensationService({ hooks }),
    approvalService:     createApprovalService(    { store: new InMemoryApprovalStore(),  hooks }),
    offerService:        createOfferService(       { store: new InMemoryOfferStore(),      hooks }),
    acceptanceService:   createAcceptanceService(  { hooks }),
    qiwaMappingService:  createQiwaMappingService(  { hooks }),
  };
}

module.exports = { createHiringModule };
