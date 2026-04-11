const policy = require("../../../shared/contracts/phase51-certification-policy.json");
function canCreateCertification(role) { return (policy.permissions.createCertification || []).includes(role); }
function initialCertificationState() { return policy.initialCertificationState; }
function initialAuditExportState() { return policy.initialAuditExportState; }
module.exports = { canCreateCertification, initialCertificationState, initialAuditExportState };
