'use strict';

/**
 * S38-G6 — PDPL Service Tests
 *
 * Coverage:
 *   Suite 1: DSR submission — required fields, invalid type, duplicate
 *   Suite 2: DSR processing — status transitions, immutable action log
 *   Suite 3: Terminal state guard — COMPLETED + REJECTED block further actions
 *   Suite 4: SLA computation — day-25 alert threshold, day-30 breach, terminal excluded
 *   Suite 5: checkSlaAlerts — filtered list, sorted by days_remaining
 *   Suite 6: Lawful basis registry — entries present, all have valid lawful_basis values
 *   Suite 7: Document content — DPIA / SCC / DPO_APPOINTMENT / DATA_RESIDENCY downloadable
 */

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { createPdplService, InMemoryDsrStore } = require('../app/modules/compliance/pdpl_service');

// ── test fixtures ─────────────────────────────────────────────────────────────

function makeHooks() {
  const events = [];
  return {
    publish: async (evt) => { events.push(evt); },
    events,
  };
}

function makeService(overrides = {}) {
  const store = overrides.store || new InMemoryDsrStore();
  const hooks = overrides.hooks || makeHooks();
  const svc   = createPdplService({ store, hooks, ...overrides });
  return { store, hooks, svc };
}

const TENANT = 'tenant-pdpl-test';

function baseDsrInput(overrides = {}) {
  return {
    dsr_id:          'dsr-' + Math.random().toString(36).slice(2),
    tenant_id:       TENANT,
    data_subject_id: 'worker-42',
    dsr_type:        'ACCESS',
    description:     'Request copy of personal data',
    ...overrides,
  };
}

// ── Suite 1: DSR Submission ───────────────────────────────────────────────────

describe('Suite 1: DSR submission', () => {
  it('creates DSR with SUBMITTED status and initial action log', async () => {
    const { svc } = makeService();
    const dsr = await svc.submitDsr(baseDsrInput());

    assert.equal(dsr.status, 'SUBMITTED');
    assert.ok(dsr.dsr_id);
    assert.ok(dsr.tenant_id);
    assert.ok(dsr.data_subject_id);
    assert.ok(dsr.submitted_at);
    assert.equal(dsr.completed_at, null);
    assert.ok(Array.isArray(dsr.actions));
    assert.equal(dsr.actions.length, 1);
    assert.equal(dsr.actions[0].action_type, 'SUBMITTED');
  });

  it('publishes DSR_SUBMITTED event with sla_due_by', async () => {
    const hooks = makeHooks();
    const { svc } = makeService({ hooks });
    await svc.submitDsr(baseDsrInput({ dsr_id: 'dsr-evt-test' }));

    const evt = hooks.events.find(e => e.event_type === 'DSR_SUBMITTED');
    assert.ok(evt, 'DSR_SUBMITTED event published');
    assert.equal(evt.aggregate_type, 'DSR');
    assert.equal(evt.aggregate_id, 'dsr-evt-test');
    assert.ok(evt.payload.sla_due_by, 'sla_due_by present in payload');
  });

  it('throws on missing dsr_id', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.submitDsr({ tenant_id: TENANT, data_subject_id: 'w-1', dsr_type: 'ACCESS' }),
      e => e.code === 'PDPL_ERROR' && /dsr_id/.test(e.message),
    );
  });

  it('throws INVALID_DSR_TYPE on unknown dsr_type', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.submitDsr(baseDsrInput({ dsr_type: 'HACK' })),
      e => e.code === 'INVALID_DSR_TYPE',
    );
  });

  it('throws DUPLICATE_DSR on duplicate dsr_id', async () => {
    const { svc } = makeService();
    const input = baseDsrInput({ dsr_id: 'dsr-dup-1' });
    await svc.submitDsr(input);
    await assert.rejects(
      () => svc.submitDsr(input),
      e => e.code === 'DUPLICATE_DSR',
    );
  });

  it('accepts all valid dsr_type values', async () => {
    const { svc } = makeService();
    const types = ['ACCESS', 'CORRECTION', 'DELETION', 'PORTABILITY', 'OBJECTION', 'RESTRICTION'];
    for (const dsr_type of types) {
      const dsr = await svc.submitDsr(baseDsrInput({ dsr_type }));
      assert.equal(dsr.dsr_type, dsr_type);
    }
  });
});

// ── Suite 2: DSR Processing — status transitions ──────────────────────────────

describe('Suite 2: DSR processing — status transitions', () => {
  it('ACKNOWLEDGED transition', async () => {
    const { svc } = makeService();
    const submitted = await svc.submitDsr(baseDsrInput());
    const updated   = await svc.processDsr(submitted.dsr_id, 'ACKNOWLEDGED', 'hr-officer-1');

    assert.equal(updated.status, 'ACKNOWLEDGED');
    assert.equal(updated.completed_at, null);
  });

  it('IN_REVIEW transition', async () => {
    const { svc } = makeService();
    const s = await svc.submitDsr(baseDsrInput());
    await svc.processDsr(s.dsr_id, 'ACKNOWLEDGED', 'hr-1');
    const updated = await svc.processDsr(s.dsr_id, 'IN_REVIEW', 'hr-1');
    assert.equal(updated.status, 'IN_REVIEW');
  });

  it('COMPLETED sets completed_at', async () => {
    const { svc } = makeService();
    const s = await svc.submitDsr(baseDsrInput());
    const updated = await svc.processDsr(s.dsr_id, 'COMPLETED', 'hr-1', 'Fulfilled successfully');
    assert.equal(updated.status, 'COMPLETED');
    assert.ok(updated.completed_at, 'completed_at set on COMPLETED');
  });

  it('REJECTED sets completed_at', async () => {
    const { svc } = makeService();
    const s = await svc.submitDsr(baseDsrInput());
    const updated = await svc.processDsr(s.dsr_id, 'REJECTED', 'hr-1', 'Outside scope');
    assert.equal(updated.status, 'REJECTED');
    assert.ok(updated.completed_at, 'completed_at set on REJECTED');
  });

  it('EXTENDED keeps status but appends log entry', async () => {
    const { svc } = makeService();
    const s = await svc.submitDsr(baseDsrInput());
    const before = await svc.getDsrStatus(s.dsr_id);
    const updated = await svc.processDsr(s.dsr_id, 'EXTENDED', 'hr-1', 'Awaiting legal review');
    assert.equal(updated.status, before.status, 'status unchanged by EXTENDED');
  });

  it('action log grows with each processDsr call — immutable append-only', async () => {
    const { svc } = makeService();
    const s = await svc.submitDsr(baseDsrInput());
    await svc.processDsr(s.dsr_id, 'ACKNOWLEDGED', 'hr-1');
    await svc.processDsr(s.dsr_id, 'IN_REVIEW', 'hr-1');
    await svc.processDsr(s.dsr_id, 'COMPLETED', 'hr-1');

    const final = await svc.getDsrStatus(s.dsr_id);
    // 1 SUBMITTED + 3 processed = 4 total actions
    assert.equal(final.actions.length, 4, 'all actions preserved in append-only log');
    assert.equal(final.actions[0].action_type, 'SUBMITTED');
    assert.equal(final.actions[1].action_type, 'ACKNOWLEDGED');
    assert.equal(final.actions[2].action_type, 'IN_REVIEW');
    assert.equal(final.actions[3].action_type, 'COMPLETED');
  });

  it('throws INVALID_ACTION_TYPE on unknown actionType', async () => {
    const { svc } = makeService();
    const s = await svc.submitDsr(baseDsrInput());
    await assert.rejects(
      () => svc.processDsr(s.dsr_id, 'APPROVE', 'hr-1'),
      e => e.code === 'INVALID_ACTION_TYPE',
    );
  });
});

// ── Suite 3: Terminal state guard ─────────────────────────────────────────────

describe('Suite 3: terminal state guard', () => {
  it('COMPLETED DSR blocks further processDsr — DSR_TERMINAL', async () => {
    const { svc } = makeService();
    const s = await svc.submitDsr(baseDsrInput());
    await svc.processDsr(s.dsr_id, 'COMPLETED', 'hr-1');
    await assert.rejects(
      () => svc.processDsr(s.dsr_id, 'ACKNOWLEDGED', 'hr-1'),
      e => e.code === 'DSR_TERMINAL',
    );
  });

  it('REJECTED DSR blocks further processDsr — DSR_TERMINAL', async () => {
    const { svc } = makeService();
    const s = await svc.submitDsr(baseDsrInput());
    await svc.processDsr(s.dsr_id, 'REJECTED', 'hr-1');
    await assert.rejects(
      () => svc.processDsr(s.dsr_id, 'IN_REVIEW', 'hr-1'),
      e => e.code === 'DSR_TERMINAL',
    );
  });
});

// ── Suite 4: SLA computation ──────────────────────────────────────────────────

describe('Suite 4: SLA computation', () => {
  it('getDsrStatus includes sla fields', async () => {
    const { svc } = makeService();
    const s = await svc.submitDsr(baseDsrInput());
    const status = await svc.getDsrStatus(s.dsr_id);

    assert.ok(status.sla, 'sla field present');
    assert.equal(typeof status.sla.days_since_submission, 'number');
    assert.equal(typeof status.sla.days_remaining, 'number');
    assert.equal(status.sla.sla_days, 30);
    assert.equal(status.sla.alert_threshold_days, 25);
    assert.equal(status.sla.sla_alert, false, 'no alert for brand-new DSR');
    assert.equal(status.sla.sla_breached, false, 'no breach for brand-new DSR');
  });

  it('sla_alert triggers at >= day 25 — not yet at day 24', async () => {
    const { svc } = makeService();
    // Simulate submitted 24 days ago — no alert yet
    const pastDate24 = new Date(Date.now() - 24 * 24 * 60 * 60 * 1000).toISOString();
    const s = await svc.submitDsr(baseDsrInput({ submitted_at: pastDate24 }));
    const status = await svc.getDsrStatus(s.dsr_id);
    assert.equal(status.sla.sla_alert, false, 'no alert at day 24');
    assert.equal(status.sla.sla_breached, false);
  });

  it('sla_alert triggers at day 25 — alert fires at threshold', async () => {
    const { svc } = makeService();
    // Simulate submitted 26 days ago (past threshold of 25)
    const pastDate26 = new Date(Date.now() - 26 * 24 * 60 * 60 * 1000).toISOString();
    const s = await svc.submitDsr(baseDsrInput({ submitted_at: pastDate26 }));
    const status = await svc.getDsrStatus(s.dsr_id);
    assert.equal(status.sla.sla_alert, true, 'alert fires past day 25');
    assert.equal(status.sla.sla_breached, false, 'not yet breached at day 26');
  });

  it('sla_breached triggers at >= day 30', async () => {
    const { svc } = makeService();
    const pastDate31 = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const s = await svc.submitDsr(baseDsrInput({ submitted_at: pastDate31 }));
    const status = await svc.getDsrStatus(s.dsr_id);
    assert.equal(status.sla.sla_alert, true);
    assert.equal(status.sla.sla_breached, true, 'sla_breached at day 31');
    assert.equal(status.sla.days_remaining, 0, 'days_remaining clamped to 0 on breach');
  });

  it('terminal DSR has null days_remaining in sla', async () => {
    const { svc } = makeService();
    const s = await svc.submitDsr(baseDsrInput());
    await svc.processDsr(s.dsr_id, 'COMPLETED', 'hr-1');
    const status = await svc.getDsrStatus(s.dsr_id);
    assert.equal(status.sla.days_remaining, null, 'days_remaining null for terminal DSR');
    assert.equal(status.sla.sla_alert, false);
    assert.equal(status.sla.sla_breached, false);
  });
});

// ── Suite 5: checkSlaAlerts ───────────────────────────────────────────────────

describe('Suite 5: checkSlaAlerts', () => {
  it('returns empty array when no DSRs in alert state', async () => {
    const { svc } = makeService();
    await svc.submitDsr(baseDsrInput());  // brand new — not in alert
    const alerts = await svc.checkSlaAlerts(TENANT);
    assert.equal(alerts.length, 0);
  });

  it('returns DSRs past day-25 threshold, excludes terminal', async () => {
    const { svc } = makeService();
    const pastDate = new Date(Date.now() - 27 * 24 * 60 * 60 * 1000).toISOString();

    // Alert DSR (27 days old, SUBMITTED)
    const alertDsr = await svc.submitDsr(baseDsrInput({ dsr_id: 'dsr-alert', submitted_at: pastDate }));
    // Recent DSR (no alert)
    await svc.submitDsr(baseDsrInput({ dsr_id: 'dsr-fresh' }));
    // Completed old DSR (should be excluded)
    const oldDone = await svc.submitDsr(baseDsrInput({ dsr_id: 'dsr-done', submitted_at: pastDate }));
    await svc.processDsr(oldDone.dsr_id, 'COMPLETED', 'hr-1');

    const alerts = await svc.checkSlaAlerts(TENANT);
    assert.equal(alerts.length, 1, 'only 1 alert (completed DSR excluded)');
    assert.equal(alerts[0].dsr_id, alertDsr.dsr_id);
    assert.equal(alerts[0].sla.sla_alert, true);
  });

  it('sorts alerts by days_remaining ascending (most urgent first)', async () => {
    const { svc } = makeService();
    const date29 = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
    const date26 = new Date(Date.now() - 26 * 24 * 60 * 60 * 1000).toISOString();

    await svc.submitDsr(baseDsrInput({ dsr_id: 'dsr-day26', submitted_at: date26 }));
    await svc.submitDsr(baseDsrInput({ dsr_id: 'dsr-day29', submitted_at: date29 }));

    const alerts = await svc.checkSlaAlerts(TENANT);
    assert.equal(alerts.length, 2);
    // Most urgent (fewest days remaining) first
    assert.ok(
      (alerts[0].sla.days_remaining ?? 0) <= (alerts[1].sla.days_remaining ?? 0),
      'sorted ascending by days_remaining',
    );
  });
});

// ── Suite 6: Lawful basis registry ───────────────────────────────────────────

describe('Suite 6: lawful basis registry', () => {
  it('returns non-empty registry from policy', () => {
    const { svc } = makeService();
    const registry = svc.getLawfulBasisRegistry();
    assert.ok(Array.isArray(registry));
    assert.ok(registry.length > 0, 'registry has entries');
  });

  it('all entries have a valid lawful_basis value', () => {
    const { svc } = makeService();
    const registry = svc.getLawfulBasisRegistry();
    const valid = new Set(['CONTRACT', 'CONSENT', 'LEGITIMATE_INTEREST']);
    for (const entry of registry) {
      assert.ok(
        valid.has(entry.lawful_basis),
        `entry ${entry.registry_id} has invalid lawful_basis: ${entry.lawful_basis}`,
      );
    }
  });

  it('all entries have required fields: registry_id, data_category, processing_purpose, jurisdiction', () => {
    const { svc } = makeService();
    const registry = svc.getLawfulBasisRegistry();
    for (const entry of registry) {
      assert.ok(entry.registry_id,        `${entry.registry_id}: registry_id missing`);
      assert.ok(entry.data_category,       `${entry.registry_id}: data_category missing`);
      assert.ok(entry.processing_purpose,  `${entry.registry_id}: processing_purpose missing`);
      assert.ok(Array.isArray(entry.jurisdiction) && entry.jurisdiction.length > 0,
        `${entry.registry_id}: jurisdiction missing or empty`);
    }
  });

  it('covers both CONTRACT and CONSENT and LEGITIMATE_INTEREST', () => {
    const { svc } = makeService();
    const registry = svc.getLawfulBasisRegistry();
    const bases = new Set(registry.map(e => e.lawful_basis));
    assert.ok(bases.has('CONTRACT'),            'CONTRACT basis present');
    assert.ok(bases.has('CONSENT'),             'CONSENT basis present');
    assert.ok(bases.has('LEGITIMATE_INTEREST'), 'LEGITIMATE_INTEREST basis present');
  });
});

// ── Suite 7: Document content ─────────────────────────────────────────────────

describe('Suite 7: document content download', () => {
  it('getDocumentContent(DPIA) returns non-empty string', () => {
    const { svc } = makeService();
    const content = svc.getDocumentContent('DPIA');
    assert.ok(typeof content === 'string' && content.length > 0, 'DPIA content present');
    assert.ok(content.includes('DPIA') || content.includes('DATA PROTECTION'), 'DPIA content mentions DPIA');
  });

  it('getDocumentContent(SCC) returns Standard Contractual Clauses content', () => {
    const { svc } = makeService();
    const content = svc.getDocumentContent('SCC');
    assert.ok(typeof content === 'string' && content.length > 0, 'SCC content present');
    assert.ok(content.includes('CONTRACTUAL') || content.includes('SCC'), 'SCC content relevant');
  });

  it('getDocumentContent(DPO_APPOINTMENT) returns DPO appointment content', () => {
    const { svc } = makeService();
    const content = svc.getDocumentContent('DPO_APPOINTMENT');
    assert.ok(typeof content === 'string' && content.length > 0, 'DPO_APPOINTMENT content present');
    assert.ok(content.includes('DPO') || content.includes('DATA PROTECTION OFFICER'), 'DPO content relevant');
  });

  it('getDocumentContent(DATA_RESIDENCY) returns data residency statement', () => {
    const { svc } = makeService();
    const content = svc.getDocumentContent('DATA_RESIDENCY');
    assert.ok(typeof content === 'string' && content.length > 0, 'DATA_RESIDENCY content present');
    assert.ok(content.includes('RESIDENCY') || content.includes('data centre'), 'DATA_RESIDENCY content relevant');
  });

  it('getDocumentContent for unknown type returns null', () => {
    const { svc } = makeService();
    const content = svc.getDocumentContent('NONEXISTENT_DOC');
    assert.equal(content, null);
  });

  it('all 4 PDPL documents are downloadable (non-null content)', () => {
    const { svc } = makeService();
    const docTypes = ['DPIA', 'SCC', 'DPO_APPOINTMENT', 'DATA_RESIDENCY'];
    for (const docType of docTypes) {
      const content = svc.getDocumentContent(docType);
      assert.ok(content !== null, `${docType} must be downloadable`);
      assert.ok(content.length > 100, `${docType} content should be substantial`);
    }
  });
});
