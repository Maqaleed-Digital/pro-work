'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  createComplianceRiskService,
  computeNitaqatScore,
  computeWpsScore,
  computeProbationScore,
  computeDocumentationScore,
  computeOverallScore,
  buildRedAlerts,
  scoreColor,
  POLICY,
} = require('../app/modules/compliance/compliance_risk_service');

// ── fixtures ──────────────────────────────────────────────────────────────────

function nowIso() { return '2026-04-16T10:00:00.000Z'; }

function makeWpsPack(overrides = {}) {
  return {
    pack_id:                      overrides.pack_id      || 'pack-001',
    worker_id:                    overrides.worker_id    || 'w-001',
    tenant_id:                    overrides.tenant_id    || 'tenant-1',
    iban_status:                  overrides.iban_status  || 'VERIFIED',
    identity_verification_status: overrides.identity     || 'VERIFIED',
    bank_confirmation_status:     overrides.bank         || 'CONFIRMED',
    wps_package:                  { structureValid: overrides.wpsValid !== false },
    evidence_pack:                { steps: overrides.steps || [
      { stepId: 'IBAN_VERIFIED'         },
      { stepId: 'IDENTITY_VERIFIED'     },
      { stepId: 'BANK_CONFIRMED'        },
      { stepId: 'WPS_PACKAGE_GENERATED' },
    ]},
    generated_at: overrides.generated_at || nowIso(),
  };
}

function makeProbationCase(overrides = {}) {
  const started = overrides.started_at || '2026-01-01T00:00:00.000Z';
  return {
    governance_case_id:        overrides.governance_case_id || 'gc-001',
    worker_id:                 overrides.worker_id          || 'w-001',
    tenant_id:                 overrides.tenant_id          || 'tenant-1',
    period_days:               overrides.period_days        || 90,
    started_at:                started,
    max_end_date:              overrides.max_end_date       || '2026-04-15T00:00:00.000Z',
    status:                    overrides.status             || 'ACTIVE',
    decision_status:           overrides.decision_status    || 'PENDING',
    evidence_pack_compiled_at: overrides.evidence_pack_compiled_at ?? null,
  };
}

function makeDocument(overrides = {}) {
  return {
    document_id:   overrides.document_id   || 'doc-001',
    worker_id:     overrides.worker_id     || 'w-001',
    tenant_id:     overrides.tenant_id     || 'tenant-1',
    document_type: overrides.document_type || 'IQAMA',
    expires_at:    overrides.expires_at    || null,
  };
}

function makeStores({ packs = [], cases = [], docs = [] } = {}) {
  return {
    wpsStore:       { async allPacks() { return packs; } },
    probationStore: { async allCases() { return cases; } },
    documentStore:  { async all()      { return docs;  } },
  };
}

// ── scoreColor ────────────────────────────────────────────────────────────────

describe('scoreColor', () => {
  test('GREEN when score >= 80', () => {
    assert.equal(scoreColor(80), 'GREEN');
    assert.equal(scoreColor(100), 'GREEN');
  });

  test('AMBER when score in [50, 80)', () => {
    assert.equal(scoreColor(50), 'AMBER');
    assert.equal(scoreColor(79), 'AMBER');
  });

  test('RED when score below 50', () => {
    assert.equal(scoreColor(49), 'RED');
    assert.equal(scoreColor(0),  'RED');
  });

  test('RED when score is null', () => {
    assert.equal(scoreColor(null), 'RED');
  });
});

// ── computeNitaqatScore ───────────────────────────────────────────────────────

describe('computeNitaqatScore', () => {
  test('PLATINUM zone returns score 100 GREEN', () => {
    const r = computeNitaqatScore({ zone: 'PLATINUM', saudization_pct: 35 });
    assert.equal(r.score, 100);
    assert.equal(r.color, 'GREEN');
    assert.equal(r.zone, 'PLATINUM');
  });

  test('GREEN zone returns score 80 GREEN', () => {
    const r = computeNitaqatScore({ zone: 'GREEN' });
    assert.equal(r.score, 80);
    assert.equal(r.color, 'GREEN');
  });

  test('YELLOW zone returns score 50 AMBER', () => {
    const r = computeNitaqatScore({ zone: 'YELLOW' });
    assert.equal(r.score, 50);
    assert.equal(r.color, 'AMBER');
  });

  test('RED zone returns score 20 RED', () => {
    const r = computeNitaqatScore({ zone: 'RED' });
    assert.equal(r.score, 20);
    assert.equal(r.color, 'RED');
  });

  test('null zoneData returns insufficient_data=true and score=0', () => {
    const r = computeNitaqatScore(null);
    assert.equal(r.insufficient_data, true);
    assert.equal(r.score, 0);
  });

  test('zone scores match policy config', () => {
    Object.entries(POLICY.nitaqat.zoneScores).forEach(([zone, expected]) => {
      const r = computeNitaqatScore({ zone });
      assert.equal(r.score, expected, `zone ${zone} score`);
    });
  });
});

// ── computeWpsScore ───────────────────────────────────────────────────────────

describe('computeWpsScore', () => {
  test('100% when all packs complete', () => {
    const packs = [makeWpsPack({ tenant_id: 'tenant-1' }), makeWpsPack({ pack_id: 'p2', worker_id: 'w-002', tenant_id: 'tenant-1' })];
    const r = computeWpsScore('tenant-1', packs, nowIso());
    assert.equal(r.score, 100);
    assert.equal(r.complete_packs, 2);
    assert.equal(r.color, 'GREEN');
  });

  test('0% when all packs failed', () => {
    const packs = [makeWpsPack({ tenant_id: 'tenant-1', iban_status: 'FAILED' })];
    const r = computeWpsScore('tenant-1', packs, nowIso());
    assert.equal(r.score, 0);
    assert.equal(r.failed_packs, 1);
    assert.equal(r.color, 'RED');
  });

  test('insufficient_data=true when no packs for tenant', () => {
    const r = computeWpsScore('tenant-x', [], nowIso());
    assert.equal(r.insufficient_data, true);
    assert.equal(r.total_packs, 0);
  });

  test('only counts packs from matching tenant', () => {
    const packs = [
      makeWpsPack({ pack_id: 'p1', tenant_id: 'tenant-1' }),
      makeWpsPack({ pack_id: 'p2', tenant_id: 'tenant-2', iban_status: 'FAILED' }),
    ];
    const r = computeWpsScore('tenant-1', packs, nowIso());
    assert.equal(r.total_packs, 1);
    assert.equal(r.complete_packs, 1);
  });

  test('PENDING_STALE when pack pending > 7 days', () => {
    const oldDate = '2026-04-01T00:00:00.000Z';  // 15 days before now
    const pack = makeWpsPack({
      tenant_id: 'tenant-1',
      iban_status: 'PENDING',
      generated_at: oldDate,
      steps: [],   // no steps completed → not complete
    });
    const r = computeWpsScore('tenant-1', [pack], nowIso());
    assert.equal(r.rows[0].status, 'PENDING_STALE');
  });
});

// ── computeProbationScore ─────────────────────────────────────────────────────

describe('computeProbationScore', () => {
  test('score 100 when no active cases', () => {
    const r = computeProbationScore('tenant-1', [], nowIso());
    assert.equal(r.score, 100);
    assert.equal(r.active_cases, 0);
  });

  test('RED urgency when <7 days remaining', () => {
    // max_end_date = 3 days from now
    const endDate = '2026-04-19T00:00:00.000Z';
    const c = makeProbationCase({ tenant_id: 'tenant-1', max_end_date: endDate });
    const r = computeProbationScore('tenant-1', [c], nowIso());
    assert.equal(r.deadlines[0].urgency, 'RED');
    assert.equal(r.red_cases, 1);
  });

  test('AMBER urgency when <30 days remaining', () => {
    // max_end_date = 20 days from now
    const endDate = '2026-05-06T00:00:00.000Z';
    const c = makeProbationCase({ tenant_id: 'tenant-1', max_end_date: endDate });
    const r = computeProbationScore('tenant-1', [c], nowIso());
    assert.equal(r.deadlines[0].urgency, 'AMBER');
    assert.equal(r.amber_cases, 1);
  });

  test('score penalised per RED case — matches policy config', () => {
    const endDate = '2026-04-19T00:00:00.000Z'; // RED (3 days)
    const c = makeProbationCase({ tenant_id: 'tenant-1', max_end_date: endDate });
    const r = computeProbationScore('tenant-1', [c], nowIso());
    const expected = Math.max(0, 100 - POLICY.probation.penaltyPerRedCase);
    assert.equal(r.score, expected);
  });

  test('evidence_ready=true when day 80+ and evidence_pack_compiled_at set', () => {
    // started 90 days ago, evidence compiled
    const startedAt = '2026-01-16T00:00:00.000Z';
    const endDate   = '2026-04-20T00:00:00.000Z';
    const c = makeProbationCase({
      tenant_id: 'tenant-1',
      started_at: startedAt,
      max_end_date: endDate,
      evidence_pack_compiled_at: '2026-04-14T00:00:00.000Z',
    });
    const r = computeProbationScore('tenant-1', [c], nowIso());
    assert.equal(r.deadlines[0].evidence_ready, true);
    assert.equal(r.deadlines[0].is_day80_plus,  true);
    assert.equal(r.deadlines[0].decision_required, true);
  });

  test('excludes non-ACTIVE and already-decided cases', () => {
    const c1 = makeProbationCase({ tenant_id: 'tenant-1', status: 'CLOSED',  max_end_date: '2026-04-19T00:00:00.000Z' });
    const c2 = makeProbationCase({ tenant_id: 'tenant-1', decision_status: 'CONFIRM', max_end_date: '2026-04-19T00:00:00.000Z' });
    const r = computeProbationScore('tenant-1', [c1, c2], nowIso());
    assert.equal(r.active_cases, 0);
    assert.equal(r.score, 100);
  });
});

// ── computeDocumentationScore ─────────────────────────────────────────────────

describe('computeDocumentationScore', () => {
  test('score 100 when no docs with expiry dates', () => {
    const r = computeDocumentationScore('tenant-1', [], nowIso());
    assert.equal(r.score, 100);
  });

  test('expired document shows in rows with EXPIRED status', () => {
    const doc = makeDocument({ tenant_id: 'tenant-1', expires_at: '2026-04-10T00:00:00.000Z' }); // past
    const r = computeDocumentationScore('tenant-1', [doc], nowIso());
    assert.equal(r.expired, 1);
    assert.equal(r.rows[0].status, 'EXPIRED');
  });

  test('expiring soon in 30-day window appears in rows', () => {
    const doc = makeDocument({ tenant_id: 'tenant-1', expires_at: '2026-04-30T00:00:00.000Z' }); // 14 days out
    const r = computeDocumentationScore('tenant-1', [doc], nowIso());
    assert.equal(r.expiring_soon, 1);
    assert.equal(r.rows[0].status, 'EXPIRING_SOON');
  });

  test('docs without expiry date excluded from scoring', () => {
    const doc = makeDocument({ tenant_id: 'tenant-1', expires_at: null });
    const r = computeDocumentationScore('tenant-1', [doc], nowIso());
    assert.equal(r.total_docs, 0);
  });

  test('ok docs not included in rows', () => {
    const doc = makeDocument({ tenant_id: 'tenant-1', expires_at: '2026-12-01T00:00:00.000Z' }); // far future
    const r = computeDocumentationScore('tenant-1', [doc], nowIso());
    assert.equal(r.rows.length, 0); // OK docs not in alert rows
    assert.equal(r.score, 100);
  });
});

// ── computeOverallScore ───────────────────────────────────────────────────────

describe('computeOverallScore', () => {
  test('overall score is weighted average of four components', () => {
    const w = POLICY.scoring.weights;
    const nitaqat       = { score: 80 };
    const wps           = { score: 100 };
    const probation     = { score: 75 };
    const documentation = { score: 90 };
    const expected      = Math.round(80 * w.nitaqat + 100 * w.wps + 75 * w.probation + 90 * w.documentation);
    const r = computeOverallScore({ nitaqatScore: nitaqat, wpsScore: wps, probationScore: probation, documentationScore: documentation });
    assert.equal(r.score, expected);
  });

  test('overall score color is correct for combined result', () => {
    // All 100 → should be GREEN
    const r = computeOverallScore({
      nitaqatScore: { score: 100 }, wpsScore: { score: 100 },
      probationScore: { score: 100 }, documentationScore: { score: 100 },
    });
    assert.equal(r.color, 'GREEN');
  });
});

// ── buildRedAlerts ────────────────────────────────────────────────────────────

describe('buildRedAlerts', () => {
  test('includes WPS_FAILED alert for failed pack rows', () => {
    const wpsScore = { rows: [{ status: 'FAILED', worker_id: 'w-1', pack_id: 'p-1' }] };
    const alerts   = buildRedAlerts({ wpsScore, probationScore: { deadlines: [] }, documentationScore: { rows: [] } });
    assert.ok(alerts.some(a => a.type === 'WPS_FAILED' && a.severity === 'RED'));
  });

  test('includes PROBATION_RED_DEADLINE for red urgency deadlines', () => {
    const probationScore = {
      deadlines: [{ urgency: 'RED', worker_id: 'w-1', governance_case_id: 'gc-1', days_remaining: 3, decision_required: false }]
    };
    const alerts = buildRedAlerts({ wpsScore: { rows: [] }, probationScore, documentationScore: { rows: [] } });
    assert.ok(alerts.some(a => a.type === 'PROBATION_RED_DEADLINE' && a.severity === 'RED'));
  });

  test('includes DOCUMENT_EXPIRED for expired documents', () => {
    const documentationScore = {
      rows: [{ status: 'EXPIRED', worker_id: 'w-1', document_id: 'd-1', document_type: 'IQAMA', days_remaining: -5 }]
    };
    const alerts = buildRedAlerts({ wpsScore: { rows: [] }, probationScore: { deadlines: [] }, documentationScore });
    assert.ok(alerts.some(a => a.type === 'DOCUMENT_EXPIRED' && a.severity === 'RED'));
  });

  test('returns empty array when no red items', () => {
    const alerts = buildRedAlerts({
      wpsScore: { rows: [{ status: 'COMPLETE' }] },
      probationScore: { deadlines: [{ urgency: 'GREEN', decision_required: false }] },
      documentationScore: { rows: [] },
    });
    const redAlerts = alerts.filter(a => a.severity === 'RED');
    assert.equal(redAlerts.length, 0);
  });
});

// ── buildDashboard integration ────────────────────────────────────────────────

describe('buildDashboard integration', () => {
  test('returns all five top-level fields', async () => {
    const svc = createComplianceRiskService(makeStores());
    const dash = await svc.buildDashboard({ tenantId: 'tenant-1', now: nowIso() });
    assert.ok('overall'    in dash, 'overall present');
    assert.ok('components' in dash, 'components present');
    assert.ok('red_alerts' in dash, 'red_alerts present');
    assert.ok('computed_at' in dash, 'computed_at present');
    assert.equal(dash.policy_version, POLICY.version);
  });

  test('overall score color is derived from weighted score', async () => {
    const svc  = createComplianceRiskService(makeStores());
    const dash = await svc.buildDashboard({ tenantId: 'tenant-1', now: nowIso() });
    const expectedColor = dash.overall.score >= 80 ? 'GREEN' : dash.overall.score >= 50 ? 'AMBER' : 'RED';
    assert.equal(dash.overall.color, expectedColor);
  });

  test('WPS red pack appears in red_alerts', async () => {
    const packs = [makeWpsPack({ tenant_id: 'tenant-1', iban_status: 'FAILED' })];
    const svc   = createComplianceRiskService(makeStores({ packs }));
    const dash  = await svc.buildDashboard({ tenantId: 'tenant-1', now: nowIso() });
    assert.ok(dash.red_alerts.some(a => a.type === 'WPS_FAILED'), 'WPS failure in red alerts');
  });

  test('probation red deadline appears in red_alerts', async () => {
    const endDate = '2026-04-19T00:00:00.000Z'; // 3 days from now → RED
    const cases   = [makeProbationCase({ tenant_id: 'tenant-1', max_end_date: endDate })];
    const svc     = createComplianceRiskService(makeStores({ cases }));
    const dash    = await svc.buildDashboard({ tenantId: 'tenant-1', now: nowIso() });
    assert.ok(dash.red_alerts.some(a => a.type === 'PROBATION_RED_DEADLINE'), 'probation red in alerts');
  });
});

// ── POLICY config ─────────────────────────────────────────────────────────────

describe('POLICY config', () => {
  test('version is v1', () => {
    assert.equal(POLICY.version, 'v1');
  });

  test('scoring weights sum to 1.0', () => {
    const w = POLICY.scoring.weights;
    const total = w.nitaqat + w.wps + w.probation + w.documentation;
    assert.ok(Math.abs(total - 1.0) < 0.001, `weights sum to ${total}, expected 1.0`);
  });

  test('probation red threshold is 7 days', () => {
    assert.equal(POLICY.probation.redDaysThreshold, 7);
  });

  test('probation amber threshold is 30 days', () => {
    assert.equal(POLICY.probation.amberDaysThreshold, 30);
  });

  test('document alert window is 30 days', () => {
    assert.equal(POLICY.documentation.expiryAlertWindowDays, 30);
  });
});
