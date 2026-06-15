'use strict';

function normalizeSkill(skill) {
  return String(skill || '').trim().toLowerCase();
}

function buildCandidateVector(candidate) {
  const set = new Set((candidate.skills || []).map(normalizeSkill).filter(Boolean));
  return {
    candidate_id: candidate.candidate_id,
    skills: set,
  };
}

function buildRequisitionVector(requisition) {
  const set = new Set((requisition.required_skills || []).map(normalizeSkill).filter(Boolean));
  return {
    requisition_id: requisition.requisition_id,
    skills: set,
  };
}

function overlapScore(candidate, requisition) {
  const c = buildCandidateVector(candidate).skills;
  const r = buildRequisitionVector(requisition).skills;
  if (r.size === 0) {
    return 0;
  }
  let matches = 0;
  for (const skill of r) {
    if (c.has(skill)) {
      matches += 1;
    }
  }
  return matches / r.size;
}

function missingSkills(candidate, requisition) {
  const c = buildCandidateVector(candidate).skills;
  const r = buildRequisitionVector(requisition).skills;
  const missing = [];
  for (const skill of r) {
    if (!c.has(skill)) {
      missing.push(skill);
    }
  }
  return missing;
}

module.exports = {
  normalizeSkill,
  buildCandidateVector,
  buildRequisitionVector,
  overlapScore,
  missingSkills,
};
