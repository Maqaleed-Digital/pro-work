const policy = require("../../../shared/contracts/phase45-authorization-policy.json");

function canAdvance(role) {
  return policy.permissions.advanceOpportunityStage.includes(role);
}

function isAllowedTransition(fromStage, toStage) {
  return (policy.allowedTransitions[fromStage] || []).includes(toStage);
}

module.exports = {
  canAdvance,
  isAllowedTransition
};
