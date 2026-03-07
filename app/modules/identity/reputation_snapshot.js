'use strict';

function generateReputationSnapshot(profile) {
  const score =
    (profile.completed_projects || 0) * 10 +
    (profile.approved_reviews || 0) * 5 +
    (profile.leadership_acts || 0) * 7 +
    (profile.compliance_verifications || 0) * 4;

  let rank = 'NEW';

  if (score >= 80) {
    rank = 'VERIFIED';
  } else if (score >= 50) {
    rank = 'ELITE';
  } else if (score >= 20) {
    rank = 'PROFESSIONAL';
  }

  return { score, rank };
}

module.exports = generateReputationSnapshot;
