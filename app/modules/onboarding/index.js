'use strict';

const { createDocumentService,   InMemoryDocumentStore   } = require('./document_service');
const { createChecklistService,  InMemoryChecklistStore  } = require('./checklist_service');
const { createContractService,   InMemoryContractStore   } = require('./contract_service');
const { createConsentService,    InMemoryConsentStore    } = require('./consent_service');
const { createComplianceService, InMemoryComplianceStore } = require('./compliance_service');
const { createProbationService,  InMemoryProbationStore  } = require('./probation_service');

function createOnboardingModule({ hooks }) {
  return {
    documentService:   createDocumentService(  { store: new InMemoryDocumentStore(),   hooks }),
    checklistService:  createChecklistService( { store: new InMemoryChecklistStore(),  hooks }),
    contractService:   createContractService(  { store: new InMemoryContractStore(),   hooks }),
    consentService:    createConsentService(   { store: new InMemoryConsentStore(),    hooks }),
    complianceService: createComplianceService({ store: new InMemoryComplianceStore(), hooks }),
    probationService:  createProbationService( { store: new InMemoryProbationStore(),  hooks }),
  };
}

module.exports = { createOnboardingModule };
