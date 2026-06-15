'use strict';

/**
 * S39-G1 — SDP Programme Service Tests
 *
 * Suite 1: Programme creation — required fields, time-box enforcement
 * Suite 2: Forbidden field structural gate — shift / attendance / exclusivity
 * Suite 3: Date validation — missing, invalid, end-before-start
 * Suite 4: Worker enrolment — happy path, duplicate, capacity gate
 * Suite 5: Enrolment completion — outcomes, terminal guard
 * Suite 6: Worker withdrawal — status, terminal guard
 * Suite 7: Query methods — listProgrammes, getProgrammeEnrolments, getWorkerEnrolments
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createSdpService, InMemorySdpStore, FORBIDDEN_FIELDS } = require('../app/modules/sdp/sdp_service');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeHooks() {
  const events = [];
  return { publish: async e => { events.push(e); }, events };
}

function makeService(overrides = {}) {
  const store = overrides.store || new InMemorySdpStore();
  const hooks = overrides.hooks || makeHooks();
  const svc   = createSdpService({ store, hooks, ...overrides });
  return { store, hooks, svc };
}

const TENANT = 'tenant-sdp-01';

function baseProgramme(overrides = {}) {
  return {
    programme_id: 'prog-' + Math.random().toString(36).slice(2),
    tenant_id:    TENANT,
    title:        'Python for Data Analysis',
    category:     'TECHNICAL',
    start_date:   '2026-06-01',
    end_date:     '2026-08-31',
    capacity:     20,
    created_by:   'hr-mgr-1',
    ...overrides,
  };
}

// ── Suite 1: Programme creation ───────────────────────────────────────────────

describe('Suite 1: programme creation', () => {
  it('creates a valid programme with required fields', async () => {
    const { svc } = makeService();
    const prog = await svc.createProgramme(baseProgramme());

    assert.ok(prog.programme_id);
    assert.equal(prog.status, 'OPEN');
    assert.equal(prog.start_date, '2026-06-01');
    assert.equal(prog.end_date, '2026-08-31');
    assert.ok(prog.created_at);
  });

  it('publishes SDP_PROGRAMME_CREATED event with date fields', async () => {
    const hooks = makeHooks();
    const { svc } = makeService({ hooks });
    const prog = await svc.createProgramme(baseProgramme({ programme_id: 'prog-evt-1' }));

    const evt = hooks.events.find(e => e.event_type === 'SDP_PROGRAMME_CREATED');
    assert.ok(evt, 'SDP_PROGRAMME_CREATED event published');
    assert.equal(evt.payload.programme_id, prog.programme_id);
    assert.equal(evt.payload.start_date, '2026-06-01');
    assert.equal(evt.payload.end_date, '2026-08-31');
  });

  it('throws on missing programme_id', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.createProgramme({ tenant_id: TENANT, title: 'T', start_date: '2026-06-01', end_date: '2026-08-31' }),
      e => e.name === 'SdpServiceError' && /programme_id/.test(e.message),
    );
  });

  it('throws on missing title', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.createProgramme({ programme_id: 'p1', tenant_id: TENANT, start_date: '2026-06-01', end_date: '2026-08-31' }),
      e => /title/.test(e.message),
    );
  });

  it('throws DUPLICATE_PROGRAMME on duplicate programme_id', async () => {
    const { svc } = makeService();
    const input = baseProgramme({ programme_id: 'prog-dup' });
    await svc.createProgramme(input);
    await assert.rejects(
      () => svc.createProgramme(input),
      e => e.code === 'DUPLICATE_PROGRAMME',
    );
  });
});

// ── Suite 2: Forbidden field structural gate ──────────────────────────────────
//
// These tests verify that SDP is NOT shift scheduling, NOT attendance tracking,
// and NOT worker exclusivity. The rejection is structural — FORBIDDEN_FIELD error,
// not a warning or a no-op strip.

describe('Suite 2: forbidden field structural gate', () => {
  it('shift_id is structurally forbidden — FORBIDDEN_FIELD', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.createProgramme(baseProgramme({ shift_id: 'shift-001' })),
      e => e.code === 'FORBIDDEN_FIELD' && e.message.includes('shift_id'),
    );
  });

  it('shift_schedule is structurally forbidden', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.createProgramme(baseProgramme({ shift_schedule: 'MON-FRI' })),
      e => e.code === 'FORBIDDEN_FIELD',
    );
  });

  it('attendance is structurally forbidden — SDP has no attendance tracking', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.createProgramme(baseProgramme({ attendance: true })),
      e => e.code === 'FORBIDDEN_FIELD' && e.message.includes('attendance'),
    );
  });

  it('attendance_required is structurally forbidden', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.createProgramme(baseProgramme({ attendance_required: true })),
      e => e.code === 'FORBIDDEN_FIELD',
    );
  });

  it('exclusive is structurally forbidden — SDP has no worker exclusivity', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.createProgramme(baseProgramme({ exclusive: true })),
      e => e.code === 'FORBIDDEN_FIELD' && e.message.includes('exclusive'),
    );
  });

  it('lock_worker is structurally forbidden', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.createProgramme(baseProgramme({ lock_worker: 'worker-1' })),
      e => e.code === 'FORBIDDEN_FIELD',
    );
  });

  it('exclusivity is structurally forbidden', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.createProgramme(baseProgramme({ exclusivity: 'FULL' })),
      e => e.code === 'FORBIDDEN_FIELD',
    );
  });

  it('updateProgramme also rejects forbidden fields', async () => {
    const { svc } = makeService();
    const prog = await svc.createProgramme(baseProgramme({ programme_id: 'prog-upd-1' }));
    await assert.rejects(
      () => svc.updateProgramme(prog.programme_id, { attendance_tracking: true }),
      e => e.code === 'FORBIDDEN_FIELD',
    );
  });

  it('FORBIDDEN_FIELDS set contains all three forbidden categories', () => {
    // shift scheduling
    assert.ok(FORBIDDEN_FIELDS.has('shift_id'));
    assert.ok(FORBIDDEN_FIELDS.has('shift_schedule'));
    // attendance
    assert.ok(FORBIDDEN_FIELDS.has('attendance'));
    assert.ok(FORBIDDEN_FIELDS.has('attendance_required'));
    // exclusivity
    assert.ok(FORBIDDEN_FIELDS.has('exclusive'));
    assert.ok(FORBIDDEN_FIELDS.has('lock_worker'));
  });
});

// ── Suite 3: Date validation ──────────────────────────────────────────────────

describe('Suite 3: date validation — time-box enforcement', () => {
  it('throws when start_date is missing', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.createProgramme({ programme_id: 'p-nd', tenant_id: TENANT, title: 'T', end_date: '2026-08-31' }),
      e => e.code === 'SDP_ERROR' && /start_date/.test(e.message),
    );
  });

  it('throws when end_date is missing', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.createProgramme({ programme_id: 'p-ned', tenant_id: TENANT, title: 'T', start_date: '2026-06-01' }),
      e => e.code === 'SDP_ERROR' && /end_date/.test(e.message),
    );
  });

  it('throws INVALID_DATE_RANGE when end_date === start_date', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.createProgramme(baseProgramme({ start_date: '2026-06-01', end_date: '2026-06-01' })),
      e => e.code === 'INVALID_DATE_RANGE',
    );
  });

  it('throws INVALID_DATE_RANGE when end_date is before start_date', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.createProgramme(baseProgramme({ start_date: '2026-08-01', end_date: '2026-06-01' })),
      e => e.code === 'INVALID_DATE_RANGE',
    );
  });

  it('accepts valid future dates with end after start', async () => {
    const { svc } = makeService();
    const prog = await svc.createProgramme(baseProgramme({ start_date: '2026-09-01', end_date: '2026-12-31' }));
    assert.equal(prog.start_date, '2026-09-01');
    assert.equal(prog.end_date, '2026-12-31');
  });

  it('throws DURATION_EXCEEDED for programme longer than 365 days', async () => {
    const { svc } = makeService();
    await assert.rejects(
      () => svc.createProgramme(baseProgramme({ start_date: '2026-01-01', end_date: '2028-01-02' })),
      e => e.code === 'DURATION_EXCEEDED',
    );
  });
});

// ── Suite 4: Worker enrolment ─────────────────────────────────────────────────

describe('Suite 4: worker enrolment', () => {
  it('enrols worker with ENROLLED status', async () => {
    const { svc } = makeService();
    const prog = await svc.createProgramme(baseProgramme({ programme_id: 'prog-enr-1' }));
    const enr  = await svc.enrolWorker(prog.programme_id, 'worker-1', TENANT, 'hr-1');

    assert.equal(enr.status, 'ENROLLED');
    assert.equal(enr.worker_id, 'worker-1');
    assert.equal(enr.programme_id, prog.programme_id);
    assert.ok(enr.enrolled_at);
    assert.equal(enr.outcome, null);
  });

  it('publishes SDP_WORKER_ENROLLED event', async () => {
    const hooks = makeHooks();
    const { svc } = makeService({ hooks });
    const prog = await svc.createProgramme(baseProgramme({ programme_id: 'prog-enr-evt' }));
    await svc.enrolWorker(prog.programme_id, 'worker-2', TENANT);
    const evt = hooks.events.find(e => e.event_type === 'SDP_WORKER_ENROLLED');
    assert.ok(evt, 'SDP_WORKER_ENROLLED event published');
    assert.equal(evt.payload.worker_id, 'worker-2');
  });

  it('throws DUPLICATE_ENROLMENT on re-enrolment', async () => {
    const { svc } = makeService();
    const prog = await svc.createProgramme(baseProgramme({ programme_id: 'prog-dup-enr' }));
    await svc.enrolWorker(prog.programme_id, 'worker-3', TENANT);
    await assert.rejects(
      () => svc.enrolWorker(prog.programme_id, 'worker-3', TENANT),
      e => e.code === 'DUPLICATE_ENROLMENT',
    );
  });

  it('throws PROGRAMME_FULL when capacity reached', async () => {
    const { svc } = makeService();
    const prog = await svc.createProgramme(baseProgramme({ programme_id: 'prog-full', capacity: 2 }));
    await svc.enrolWorker(prog.programme_id, 'worker-a', TENANT);
    await svc.enrolWorker(prog.programme_id, 'worker-b', TENANT);
    await assert.rejects(
      () => svc.enrolWorker(prog.programme_id, 'worker-c', TENANT),
      e => e.code === 'PROGRAMME_FULL',
    );
  });

  it('throws PROGRAMME_NOT_OPEN when programme is CLOSED', async () => {
    const { svc } = makeService();
    const prog = await svc.createProgramme(baseProgramme({ programme_id: 'prog-closed' }));
    await svc.updateProgramme(prog.programme_id, { status: 'CLOSED' });
    await assert.rejects(
      () => svc.enrolWorker(prog.programme_id, 'worker-x', TENANT),
      e => e.code === 'PROGRAMME_NOT_OPEN',
    );
  });
});

// ── Suite 5: Enrolment completion ─────────────────────────────────────────────

describe('Suite 5: enrolment completion', () => {
  it('completes enrolment with PASSED outcome', async () => {
    const { svc } = makeService();
    const prog = await svc.createProgramme(baseProgramme({ programme_id: 'prog-cmp-1' }));
    await svc.enrolWorker(prog.programme_id, 'worker-10', TENANT);
    const done = await svc.completeEnrolment(prog.programme_id, 'worker-10', 'PASSED', 'trainer-1');

    assert.equal(done.status, 'COMPLETED');
    assert.equal(done.outcome, 'PASSED');
    assert.ok(done.completed_at);
    assert.equal(done.completed_by, 'trainer-1');
  });

  it('accepts all valid outcomes: PASSED, FAILED, INCOMPLETE', async () => {
    const { svc } = makeService();
    const outcomes = ['PASSED', 'FAILED', 'INCOMPLETE'];
    for (const outcome of outcomes) {
      const prog = await svc.createProgramme(baseProgramme());
      await svc.enrolWorker(prog.programme_id, 'worker-oc', TENANT);
      const done = await svc.completeEnrolment(prog.programme_id, 'worker-oc', outcome, 'trainer-1');
      assert.equal(done.outcome, outcome);
    }
  });

  it('throws INVALID_OUTCOME on unknown outcome value', async () => {
    const { svc } = makeService();
    const prog = await svc.createProgramme(baseProgramme({ programme_id: 'prog-inv-oc' }));
    await svc.enrolWorker(prog.programme_id, 'worker-11', TENANT);
    await assert.rejects(
      () => svc.completeEnrolment(prog.programme_id, 'worker-11', 'EXCELLENT', 'trainer-1'),
      e => e.code === 'INVALID_OUTCOME',
    );
  });

  it('throws ENROLMENT_TERMINAL on second completion attempt', async () => {
    const { svc } = makeService();
    const prog = await svc.createProgramme(baseProgramme({ programme_id: 'prog-dbl-cmp' }));
    await svc.enrolWorker(prog.programme_id, 'worker-12', TENANT);
    await svc.completeEnrolment(prog.programme_id, 'worker-12', 'PASSED', 'trainer-1');
    await assert.rejects(
      () => svc.completeEnrolment(prog.programme_id, 'worker-12', 'FAILED', 'trainer-1'),
      e => e.code === 'ENROLMENT_TERMINAL',
    );
  });
});

// ── Suite 6: Worker withdrawal ────────────────────────────────────────────────

describe('Suite 6: worker withdrawal', () => {
  it('withdraws enrolment with WITHDRAWN status and outcome', async () => {
    const { svc } = makeService();
    const prog = await svc.createProgramme(baseProgramme({ programme_id: 'prog-wd-1' }));
    await svc.enrolWorker(prog.programme_id, 'worker-20', TENANT);
    const withdrawn = await svc.withdrawWorker(prog.programme_id, 'worker-20', 'Personal reasons');

    assert.equal(withdrawn.status, 'WITHDRAWN');
    assert.equal(withdrawn.outcome, 'WITHDRAWN');
    assert.ok(withdrawn.completed_at);
    assert.equal(withdrawn.withdrawal_reason, 'Personal reasons');
  });

  it('throws ENROLMENT_TERMINAL on re-withdrawal of already WITHDRAWN', async () => {
    const { svc } = makeService();
    const prog = await svc.createProgramme(baseProgramme({ programme_id: 'prog-wd-2' }));
    await svc.enrolWorker(prog.programme_id, 'worker-21', TENANT);
    await svc.withdrawWorker(prog.programme_id, 'worker-21');
    await assert.rejects(
      () => svc.withdrawWorker(prog.programme_id, 'worker-21'),
      e => e.code === 'ENROLMENT_TERMINAL',
    );
  });
});

// ── Suite 7: Query methods ────────────────────────────────────────────────────

describe('Suite 7: query methods', () => {
  it('listProgrammes returns all programmes for tenant', async () => {
    const { svc } = makeService();
    await svc.createProgramme(baseProgramme({ programme_id: 'prog-list-1' }));
    await svc.createProgramme(baseProgramme({ programme_id: 'prog-list-2' }));
    const list = await svc.listProgrammes(TENANT);
    assert.ok(list.length >= 2);
  });

  it('listProgrammes filters by status', async () => {
    const { svc } = makeService();
    const prog = await svc.createProgramme(baseProgramme({ programme_id: 'prog-closed-filter' }));
    await svc.updateProgramme(prog.programme_id, { status: 'CLOSED' });
    await svc.createProgramme(baseProgramme({ programme_id: 'prog-open-filter' }));

    const open   = await svc.listProgrammes(TENANT, { status: 'OPEN' });
    const closed = await svc.listProgrammes(TENANT, { status: 'CLOSED' });

    assert.ok(open.every(p => p.status === 'OPEN'));
    assert.ok(closed.every(p => p.status === 'CLOSED'));
  });

  it('getProgrammeEnrolments returns all enrolments for programme', async () => {
    const { svc } = makeService();
    const prog = await svc.createProgramme(baseProgramme({ programme_id: 'prog-enrlist', capacity: 10 }));
    await svc.enrolWorker(prog.programme_id, 'w-a', TENANT);
    await svc.enrolWorker(prog.programme_id, 'w-b', TENANT);
    const enrols = await svc.getProgrammeEnrolments(prog.programme_id);
    assert.equal(enrols.length, 2);
  });

  it('getWorkerEnrolments returns all enrolments for a worker across programmes', async () => {
    const { svc } = makeService();
    const p1 = await svc.createProgramme(baseProgramme({ programme_id: 'prog-we-1' }));
    const p2 = await svc.createProgramme(baseProgramme({ programme_id: 'prog-we-2' }));
    await svc.enrolWorker(p1.programme_id, 'worker-multi', TENANT);
    await svc.enrolWorker(p2.programme_id, 'worker-multi', TENANT);

    const enrols = await svc.getWorkerEnrolments('worker-multi', TENANT);
    assert.equal(enrols.length, 2);
    assert.ok(enrols.every(e => e.worker_id === 'worker-multi'));
  });
});
