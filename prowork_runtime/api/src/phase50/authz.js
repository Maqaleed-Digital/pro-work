const policy = require("../../../shared/contracts/phase50-evidence-pack-policy.json");
function canCreateEvidencePack(role) { return (policy.permissions.createEvidencePack || []).includes(role); }
function initialTrustState() { return policy.initialTrustState; }
function initialExportState() { return policy.initialExportState; }
module.exports = { canCreateEvidencePack, initialTrustState, initialExportState };
