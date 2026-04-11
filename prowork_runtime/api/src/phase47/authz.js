const policy = require("../../../shared/contracts/phase47-work-item-policy.json");

function canCreateWorkItem(role) {
  return policy.permissions.createWorkItem.includes(role);
}

function requiredOpportunityStage() {
  return policy.opportunityPrerequisiteStage;
}

function executionVisibleStatuses() {
  return policy.executionVisibleStatuses;
}

module.exports = {
  canCreateWorkItem,
  requiredOpportunityStage,
  executionVisibleStatuses
};
