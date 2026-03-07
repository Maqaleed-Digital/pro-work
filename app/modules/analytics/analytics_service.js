'use strict';

class AnalyticsService {

  constructor() {
    this.metrics = {
      milestones_completed: 0,
      jobs_completed: 0,
      workers_assigned: 0,
      offboardings: 0
    };
  }

  handleEvent(event) {
    switch (event.event_type) {
      case 'MILESTONE_COMPLETED':
        this.metrics.milestones_completed++;
        break;
      case 'EXECUTION_JOB_COMPLETED':
        this.metrics.jobs_completed++;
        break;
      case 'WORKER_ASSIGNED':
        this.metrics.workers_assigned++;
        break;
      case 'OFFBOARDING_COMPLETED':
        this.metrics.offboardings++;
        break;
    }
  }

  getMetrics() {
    return this.metrics;
  }

}

module.exports = new AnalyticsService();
