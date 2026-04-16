'use strict';

class UtilizationEngine {

  compute(workers, assignments) {
    if (workers === 0) {
      return 0;
    }
    const utilization = assignments / workers;
    return Math.round(utilization * 100);
  }

}

module.exports = new UtilizationEngine();
