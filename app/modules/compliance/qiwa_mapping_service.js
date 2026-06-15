'use strict';

class QiwaMappingService {

  mapContract(contract) {
    return {
      employee_name: contract.name,
      job_title: contract.role,
      base_salary: contract.salary,
      allowances: contract.allowances || 0,
      probation_days: contract.probation || 90
    };
  }

}

module.exports = new QiwaMappingService();
