'use strict';

function previewNitaqatImpact({ candidate, requisition, employerProfile, overrideInput }) {
  const effective = overrideInput || {
    nationality_code: candidate.nationality_code,
    role_family:      requisition.role_family,
    contract_type:    requisition.contract_type,
  };

  const drivers = [];
  let score = 50;

  if (effective.nationality_code === 'SA') {
    score += 25;
    drivers.push('nationality supports Saudization weighting');
  } else {
    score -= 10;
    drivers.push('non-Saudi nationality may reduce Saudization benefit');
  }

  if (effective.contract_type === 'FTE') {
    score += 10;
    drivers.push('FTE contract type improves sovereign recruiting alignment');
  } else {
    score -= 5;
    drivers.push('non-FTE contract type provides lower Nitaqat contribution confidence');
  }

  if (String(effective.role_family || '').toLowerCase().includes('engineering')) {
    score += 5;
    drivers.push('role family considered in occupational weighting');
  }

  if (employerProfile && employerProfile.current_band) {
    drivers.push(`current establishment band considered: ${employerProfile.current_band}`);
  }

  const bounded = Math.max(0, Math.min(100, score));

  return {
    preview_score:   bounded,
    movement_band:   bounded >= 70 ? 'POSITIVE' : bounded >= 45 ? 'NEUTRAL' : 'NEGATIVE',
    confidence_band: (employerProfile && employerProfile.establishment_size > 500) ? 'MEDIUM' : 'LOW',
    drivers,
    override_applied: Boolean(overrideInput),
  };
}

function validateOccupationMatch({ candidate, requisition, policyRules }) {
  const rules = policyRules || {
    prohibited_titles: [],
    credentials_required_by_role_family: {},
  };

  const issues = [];
  const title = requisition.title || '';
  if (rules.prohibited_titles.includes(title)) {
    issues.push('prohibited_title');
  }

  const requiredCredentials = rules.credentials_required_by_role_family[requisition.role_family] || [];
  const candidateCreds = new Set((candidate.credentials || []).map(String));
  for (const cred of requiredCredentials) {
    if (!candidateCreds.has(cred)) {
      issues.push(`missing_credential:${cred}`);
    }
  }

  return {
    valid:                      issues.length === 0,
    issues,
    recommended_occupation_code: requisition.occupation_code_target || null,
    explanation: issues.length === 0
      ? 'candidate aligns with role family and current policy rules'
      : 'candidate-role pairing has validation flags',
  };
}

module.exports = {
  previewNitaqatImpact,
  validateOccupationMatch,
};
