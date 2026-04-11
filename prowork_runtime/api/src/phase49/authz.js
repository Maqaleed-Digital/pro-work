const policy = require("../../../shared/contracts/phase49-delivery-artifact-policy.json");

function canCreateDeliveryArtifact(role) {
  return (policy.permissions.createDeliveryArtifact || []).includes(role);
}

function requiredWorkItemStatus() {
  return policy.workItemPrerequisiteStatus;
}

function initialEvidenceState() {
  return policy.initialEvidenceState;
}

function initialReviewState() {
  return policy.initialReviewState;
}

module.exports = {
  canCreateDeliveryArtifact,
  requiredWorkItemStatus,
  initialEvidenceState,
  initialReviewState
};
