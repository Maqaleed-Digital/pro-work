'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const eri = require('../../app/modules/eri/eri_engine');

test('ERI calculation returns positive score', () => {
  const score = eri.calculateERI({
    milestones_completed: 10,
    jobs_completed: 5
  });
  assert.ok(score > 0);
});

test('ERI calculation returns 0 when no activity', () => {
  const score = eri.calculateERI({
    milestones_completed: 0,
    jobs_completed: 0
  });
  assert.equal(score, 0);
});

test('ERI formula: (milestones * 0.6) + (jobs * 0.4)', () => {
  const score = eri.calculateERI({
    milestones_completed: 10,
    jobs_completed: 5
  });
  assert.equal(score, Math.round(10 * 0.6 + 5 * 0.4));
});
