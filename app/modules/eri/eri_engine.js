'use strict';

class ERIEngine {

  calculateERI(data) {
    const milestones = data.milestones_completed || 0;
    const jobs = data.jobs_completed || 0;
    const reliability = milestones + jobs;

    if (reliability === 0) {
      return 0;
    }

    const eri = (milestones * 0.6) + (jobs * 0.4);
    return Math.round(eri);
  }

}

module.exports = new ERIEngine();
