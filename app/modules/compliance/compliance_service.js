'use strict';

class ComplianceService {

  validateOccupationCode(role, occupationCode) {
    if (!occupationCode) {
      return { valid: false, reason: 'missing occupation code' };
    }
    if (role.toLowerCase().includes('engineer') && occupationCode !== 'ENG') {
      return { valid: false, reason: 'occupation mismatch' };
    }
    return { valid: true };
  }

}

module.exports = new ComplianceService();
