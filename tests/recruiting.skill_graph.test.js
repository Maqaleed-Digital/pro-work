'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSkill, overlapScore, missingSkills, buildCandidateVector, buildRequisitionVector } = require('../app/modules/recruiting/skill_graph');

describe('normalizeSkill', () => {
  test('lowercases and trims', () => {
    assert.equal(normalizeSkill('  Node.js  '), 'node.js');
    assert.equal(normalizeSkill('SQL'), 'sql');
    assert.equal(normalizeSkill(''), '');
  });
});

describe('overlapScore', () => {
  test('full overlap returns 1', () => {
    const c = { skills: ['Node', 'SQL', 'AI'] };
    const r = { required_skills: ['node', 'sql', 'ai'] };
    assert.equal(overlapScore(c, r), 1);
  });

  test('partial overlap', () => {
    const c = { skills: ['Node', 'SQL', 'AI'] };
    const r = { required_skills: ['node', 'sql', 'docker'] };
    assert.ok(Math.abs(overlapScore(c, r) - 2/3) < 0.001);
  });

  test('no overlap returns 0', () => {
    const c = { skills: ['Python'] };
    const r = { required_skills: ['node', 'sql'] };
    assert.equal(overlapScore(c, r), 0);
  });

  test('empty required_skills returns 0', () => {
    const c = { skills: ['Node'] };
    const r = { required_skills: [] };
    assert.equal(overlapScore(c, r), 0);
  });

  test('empty candidate skills returns 0', () => {
    const c = { skills: [] };
    const r = { required_skills: ['node'] };
    assert.equal(overlapScore(c, r), 0);
  });

  test('case insensitive matching', () => {
    const c = { skills: ['Node.JS', 'PostgreSQL'] };
    const r = { required_skills: ['node.js', 'postgresql'] };
    assert.equal(overlapScore(c, r), 1);
  });
});

describe('missingSkills', () => {
  test('returns skills not in candidate', () => {
    const c = { skills: ['Node', 'SQL', 'AI'] };
    const r = { required_skills: ['node', 'sql', 'docker'] };
    assert.deepEqual(missingSkills(c, r), ['docker']);
  });

  test('returns empty when fully matched', () => {
    const c = { skills: ['node', 'sql'] };
    const r = { required_skills: ['node', 'sql'] };
    assert.deepEqual(missingSkills(c, r), []);
  });

  test('returns all required when no candidate skills', () => {
    const c = { skills: [] };
    const r = { required_skills: ['node', 'sql'] };
    assert.deepEqual(missingSkills(c, r), ['node', 'sql']);
  });
});

describe('buildCandidateVector / buildRequisitionVector', () => {
  test('buildCandidateVector normalizes skills into a Set', () => {
    const v = buildCandidateVector({ candidate_id: 'c1', skills: ['Node', 'SQL', 'SQL'] });
    assert.ok(v.skills instanceof Set);
    assert.equal(v.skills.size, 2); // deduped
    assert.ok(v.skills.has('node'));
    assert.ok(v.skills.has('sql'));
  });

  test('buildRequisitionVector handles missing required_skills gracefully', () => {
    const v = buildRequisitionVector({ requisition_id: 'r1' });
    assert.ok(v.skills instanceof Set);
    assert.equal(v.skills.size, 0);
  });
});
