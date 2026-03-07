'use strict';

function projectExecutionProfile(records) {
  const profile = {
    completed_projects: 0,
    approved_reviews: 0,
    leadership_acts: 0,
    compliance_verifications: 0
  };

  for (const record of records) {
    if (record.type === 'PROJECT_COMPLETED') {
      profile.completed_projects += 1;
    }
    if (record.type === 'PHR_APPROVED') {
      profile.approved_reviews += 1;
    }
    if (record.type === 'TEAM_LEAD') {
      profile.leadership_acts += 1;
    }
    if (record.type === 'COMPLIANCE_VERIFIED') {
      profile.compliance_verifications += 1;
    }
  }

  return profile;
}

module.exports = projectExecutionProfile;
