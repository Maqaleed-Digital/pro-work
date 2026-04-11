const policy = require("../../../shared/contracts/phase48-lifecycle-policy.json");

function includesPermission(name, role) {
  return (policy.permissions[name] || []).includes(role);
}

function canStart(role) {
  return includesPermission("startWorkItem", role);
}

function canBlock(role) {
  return includesPermission("blockWorkItem", role);
}

function canComplete(role) {
  return includesPermission("completeWorkItem", role);
}

function isAllowedTransition(fromStatus, toStatus) {
  return (policy.allowedTransitions[fromStatus] || []).includes(toStatus);
}

function executionVisibleStatuses() {
  return policy.executionVisibleStatuses;
}

module.exports = {
  canStart,
  canBlock,
  canComplete,
  isAllowedTransition,
  executionVisibleStatuses
};
