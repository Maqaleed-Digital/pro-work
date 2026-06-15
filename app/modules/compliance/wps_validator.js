'use strict';

class WPSValidator {

  validate(employee) {
    if (!employee.iban) {
      return { valid: false, reason: 'missing IBAN' };
    }
    if (employee.salary <= 0) {
      return { valid: false, reason: 'invalid salary' };
    }
    return { valid: true };
  }

}

module.exports = new WPSValidator();
