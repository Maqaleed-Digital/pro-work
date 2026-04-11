const policy = require("../../../shared/contracts/phase46-decision-policy.json");

function canApprove(role) {
  return policy.permissions.approveOpportunity.includes(role);
}

function canReject(role) {
  return policy.permissions.rejectOpportunity.includes(role);
}

function requiredDecisionStage() {
  return policy.decisionPrerequisiteStage;
}

module.exports = {
  canApprove,
  canReject,
  requiredDecisionStage
};
