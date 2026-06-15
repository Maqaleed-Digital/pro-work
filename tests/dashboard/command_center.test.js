'use strict';

// S36-G6: Command Center KPI + Risk Board tests
// Run: node --test tests/dashboard/command_center.test.js

const test   = require('node:test');
const assert = require('node:assert/strict');

const { computeKpis, computeEntityRisk, statusForValue } = require('../../app/api/dashboard_router');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTenantData({ workers = [], pods = [], assignments = [], events = [] } = {}) {
  return {
    wosWorkers:       new Map(workers.map(w => [w.id, w])),
    wosPods:          new Map(pods.map(p => [p.id, p])),
    wosAssignments:   new Map(assignments.map(a => [a.id, a])),
    wosEvidenceEvents: events,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. statusForValue — colour band logic
// ─────────────────────────────────────────────────────────────────────────────
test('statusForValue: null → unknown', () => {
  assert.equal(statusForValue(null),      'unknown');
  assert.equal(statusForValue(undefined), 'unknown');
});

test('statusForValue: >=85 → green', () => {
  assert.equal(statusForValue(85),  'green');
  assert.equal(statusForValue(100), 'green');
  assert.equal(statusForValue(90),  'green');
});

test('statusForValue: 70–84 → amber', () => {
  assert.equal(statusForValue(70), 'amber');
  assert.equal(statusForValue(84), 'amber');
  assert.equal(statusForValue(75), 'amber');
});

test('statusForValue: <70 → red', () => {
  assert.equal(statusForValue(0),  'red');
  assert.equal(statusForValue(50), 'red');
  assert.equal(statusForValue(69), 'red');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. computeKpis — shape
// ─────────────────────────────────────────────────────────────────────────────
test('computeKpis returns all four KPI keys', () => {
  const data = makeTenantData();
  const kpis = computeKpis(data);
  assert.ok('workforce'    in kpis, 'workforce missing');
  assert.ok('compliance'   in kpis, 'compliance missing');
  assert.ok('trustScore'   in kpis, 'trustScore missing');
  assert.ok('costVsBudget' in kpis, 'costVsBudget missing');
});

test('each KPI has value, trend, status fields', () => {
  const kpis = computeKpis(makeTenantData());
  for (const key of ['workforce', 'compliance', 'trustScore', 'costVsBudget']) {
    assert.ok('value'  in kpis[key], `${key}.value missing`);
    assert.ok('trend'  in kpis[key], `${key}.trend missing`);
    assert.ok('status' in kpis[key], `${key}.status missing`);
    assert.ok(Array.isArray(kpis[key].trend), `${key}.trend must be array`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Workforce % calculation
// ─────────────────────────────────────────────────────────────────────────────
test('workforce value is null when no workers', () => {
  const kpis = computeKpis(makeTenantData({ workers: [] }));
  assert.equal(kpis.workforce.value, null);
  assert.equal(kpis.workforce.status, 'unknown');
});

test('workforce calculates correct percentage: 9/10 active = 90%', () => {
  const workers = [
    ...Array.from({ length: 9 }, (_, i) => ({ id: `w${i}`, status: 'active' })),
    { id: 'w9', status: 'inactive' },
  ];
  const kpis = computeKpis(makeTenantData({ workers }));
  assert.equal(kpis.workforce.value, 90, '9/10 active = 90%');
  assert.equal(kpis.workforce.status, 'green', '90% should be green');
});

test('workforce: 7/10 active = 70% → amber', () => {
  const workers = [
    ...Array.from({ length: 7 }, (_, i) => ({ id: `w${i}`, status: 'active' })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `x${i}`, status: 'inactive' })),
  ];
  const kpis = computeKpis(makeTenantData({ workers }));
  assert.equal(kpis.workforce.value, 70);
  assert.equal(kpis.workforce.status, 'amber');
});

test('workforce: 5/10 active = 50% → red', () => {
  const workers = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, status: 'active' })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, status: 'inactive' })),
  ];
  const kpis = computeKpis(makeTenantData({ workers }));
  assert.equal(kpis.workforce.value, 50);
  assert.equal(kpis.workforce.status, 'red');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Unavailable KPIs degrade gracefully
// ─────────────────────────────────────────────────────────────────────────────
test('compliance value is null — no scan data available yet', () => {
  const kpis = computeKpis(makeTenantData());
  assert.equal(kpis.compliance.value, null);
  assert.equal(kpis.compliance.status, 'unknown');
});

test('trustScore value is null — no resolution data available yet', () => {
  const kpis = computeKpis(makeTenantData());
  assert.equal(kpis.trustScore.value, null);
  assert.equal(kpis.trustScore.status, 'unknown');
});

test('costVsBudget value is null — no financial data available yet', () => {
  const kpis = computeKpis(makeTenantData());
  assert.equal(kpis.costVsBudget.value, null);
  assert.equal(kpis.costVsBudget.status, 'unknown');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. computeEntityRisk — shape
// ─────────────────────────────────────────────────────────────────────────────
test('computeEntityRisk returns people, projects, compliance arrays', () => {
  const risk = computeEntityRisk(makeTenantData());
  assert.ok(Array.isArray(risk.people),     'people must be array');
  assert.ok(Array.isArray(risk.projects),   'projects must be array');
  assert.ok(Array.isArray(risk.compliance), 'compliance must be array');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Risk classification — people
// ─────────────────────────────────────────────────────────────────────────────
test('active worker classified as green risk', () => {
  const workers = [{ id: 'w1', name: 'Alice', status: 'active' }];
  const { people } = computeEntityRisk(makeTenantData({ workers }));
  assert.equal(people.length, 1);
  assert.equal(people[0].level, 'green');
});

test('inactive worker classified as amber risk', () => {
  const workers = [{ id: 'w2', name: 'Bob', status: 'inactive' }];
  const { people } = computeEntityRisk(makeTenantData({ workers }));
  assert.equal(people[0].level, 'amber');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Risk classification — projects (pods)
// ─────────────────────────────────────────────────────────────────────────────
test('active pod classified as green risk', () => {
  const pods = [{ id: 'p1', name: 'Sprint 1', state: 'active' }];
  const { projects } = computeEntityRisk(makeTenantData({ pods }));
  assert.equal(projects[0].level, 'green');
});

test('draft pod classified as amber risk', () => {
  const pods = [{ id: 'p2', name: 'Draft Pod', state: 'draft' }];
  const { projects } = computeEntityRisk(makeTenantData({ pods }));
  assert.equal(projects[0].level, 'amber');
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. KPI router factory — instantiates without error
// ─────────────────────────────────────────────────────────────────────────────
test('createDashboardRouter throws when getTenantStore is missing', () => {
  const { createDashboardRouter } = require('../../app/api/dashboard_router');
  assert.throws(
    () => createDashboardRouter({ authenticate: () => {} }),
    /getTenantStore/
  );
});

test('createDashboardRouter throws when authenticate is missing', () => {
  const { createDashboardRouter } = require('../../app/api/dashboard_router');
  assert.throws(
    () => createDashboardRouter({ getTenantStore: () => ({}) }),
    /authenticate/
  );
});
