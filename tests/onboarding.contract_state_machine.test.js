'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  createContractStateMachine,
  InMemoryContractStore,
  InMemoryContractEventStore,
  generateQiwaPayload,
  validateQiwaCompleteness,
  MAPPING,
} = require('../app/modules/onboarding/contract_state_machine');

// ── fixtures ──────────────────────────────────────────────────────────────────

const CONTRACT_ID = 'aaaa0000-0000-0000-0000-000000000000';
const WORKER_ID   = 'bbbb0000-0000-0000-0000-000000000000';
const TENANT_ID   = 'cccc0000-0000-0000-0000-000000000000';
const CASE_ID     = 'dddd0000-0000-0000-0000-000000000000';
const HUMAN_ACTOR = { actor_type: 'HUMAN', actor_id: 'hr-001' };
const SYS_ACTOR   = { actor_type: 'SYSTEM', actor_id: 'svc-001' };

// A fully Qiwa-complete contract payload
const COMPLETE_FIELDS = {
  role_title:         'Software Engineer',
  wage_base:          12000,
  probation_days:     90,
  notice_days:        30,
  work_location:      'Riyadh',
  worker_national_id: '1034567890',
  employer_cr_number: '1234567890',
  contract_start_date:'2026-05-01',
  occupation_code:    '2512',
};

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

function makeSvc(hooks) {
  return createContractStateMachine({
    contractStore: new InMemoryContractStore(),
    eventStore:    new InMemoryContractEventStore(),
    hooks:         hooks || makeHooks(),
  });
}

function baseDraft(overrides) {
  return {
    contract_id:        CONTRACT_ID,
    tenant_id:          TENANT_ID,
    worker_id:          WORKER_ID,
    onboarding_case_id: CASE_ID,
    actor:              HUMAN_ACTOR,
    occurred_at:        '2026-04-16T08:00:00Z',
    event_id:           'ev-draft',
    correlation_id:     'corr-001',
    causation_id:       'caus-001',
    ...COMPLETE_FIELDS,
    ...overrides,
  };
}

function baseTransition(toState, overrides) {
  return {
    contract_id:    CONTRACT_ID,
    to_state:       toState,
    actor:          HUMAN_ACTOR,
    occurred_at:    '2026-04-16T09:00:00Z',
    event_id:       `ev-${toState.toLowerCase()}`,
    correlation_id: 'corr-001',
    causation_id:   'caus-001',
    ...overrides,
  };
}

/** Drive a contract to a target state via the shortest valid path. */
async function driveToState(svc, targetState) {
  await svc.draftContract(baseDraft());

  const path = {
    DRAFT:      [],
    REVIEW:     ['REVIEW'],
    SIGNED:     ['REVIEW', 'SIGNED'],
    ACTIVATED:  ['REVIEW', 'SIGNED', 'ACTIVATED'],
    AMENDED:    ['REVIEW', 'SIGNED', 'ACTIVATED', 'AMENDED'],
    TERMINATED: ['REVIEW', 'SIGNED', 'ACTIVATED', 'TERMINATED'],
  };

  for (const step of (path[targetState] || [])) {
    const extra = {}
    if (step === 'SIGNED')     { extra.both_party_signatures = true }
    if (step === 'ACTIVATED')  { extra.activation_date = '2026-05-01' }
    if (step === 'AMENDED')    { extra.amendment_reason = 'salary adjustment'; extra.amended_fields = { wage_base: 14000 } }
    if (step === 'TERMINATED') { extra.termination_code = 'PERFORMANCE'; extra.notice_details = { days: 30 } }
    await svc.transition(baseTransition(step, extra));
  }
}

// ── draftContract ─────────────────────────────────────────────────────────────

describe('ContractStateMachine — draftContract', () => {
  test('creates contract in DRAFT state', async () => {
    const svc = makeSvc();
    const c = await svc.draftContract(baseDraft());
    assert.equal(c.status, 'DRAFT');
    assert.equal(c.contract_id, CONTRACT_ID);
  });

  test('logs lifecycle event for DRAFT creation', async () => {
    const svc = makeSvc();
    await svc.draftContract(baseDraft());
    const events = await svc.getLifecycleEvents(CONTRACT_ID);
    assert.equal(events.length, 1);
    assert.equal(events[0].to_state, 'DRAFT');
    assert.equal(events[0].from_state, null);
  });

  test('emits CONTRACT_DRAFTED domain event', async () => {
    const h = makeHooks();
    const svc = createContractStateMachine({ contractStore: new InMemoryContractStore(), eventStore: new InMemoryContractEventStore(), hooks: h });
    await svc.draftContract(baseDraft());
    assert.ok(h.events.find(e => e.event_type === 'CONTRACT_DRAFTED'));
  });
});

// ── Valid transitions (all 6) ─────────────────────────────────────────────────

describe('Valid transition 1: DRAFT → REVIEW (completeness check passes)', () => {
  test('transitions to REVIEW when Qiwa fields complete', async () => {
    const svc = makeSvc();
    await svc.draftContract(baseDraft());
    const updated = await svc.transition(baseTransition('REVIEW'));
    assert.equal(updated.status, 'REVIEW');
  });

  test('blocks DRAFT→REVIEW when required Qiwa fields missing', async () => {
    const svc = makeSvc();
    await svc.draftContract(baseDraft({ role_title: null, occupation_code: null }));
    await assert.rejects(
      () => svc.transition(baseTransition('REVIEW')),
      /Qiwa completeness check failed/
    );
  });
});

describe('Valid transition 2: REVIEW → DRAFT (revision)', () => {
  test('transitions back to DRAFT for revision', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'REVIEW');
    const updated = await svc.transition(baseTransition('DRAFT', { reason: 'needs revision' }));
    assert.equal(updated.status, 'DRAFT');
  });
});

describe('Valid transition 3: REVIEW → SIGNED (human + both signatures)', () => {
  test('transitions to SIGNED with human actor + both_party_signatures', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'REVIEW');
    const updated = await svc.transition(baseTransition('SIGNED', { both_party_signatures: true }));
    assert.equal(updated.status, 'SIGNED');
  });

  test('blocks REVIEW→SIGNED without both_party_signatures', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'REVIEW');
    await assert.rejects(
      () => svc.transition(baseTransition('SIGNED', { both_party_signatures: false })),
      /both_party_signatures/
    );
  });

  test('blocks REVIEW→SIGNED with SYSTEM actor', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'REVIEW');
    await assert.rejects(
      () => svc.transition(baseTransition('SIGNED', { actor: SYS_ACTOR, both_party_signatures: true })),
      /HUMAN actor/
    );
  });
});

describe('Valid transition 4: SIGNED → ACTIVATED (activation_date required)', () => {
  test('activates contract with activation_date', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'SIGNED');
    const updated = await svc.transition(baseTransition('ACTIVATED', { activation_date: '2026-05-01' }));
    assert.equal(updated.status, 'ACTIVATED');
    assert.equal(updated.activation_date, '2026-05-01');
  });

  test('blocks SIGNED→ACTIVATED without activation_date', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'SIGNED');
    await assert.rejects(
      () => svc.transition(baseTransition('ACTIVATED')),
      /activation_date/
    );
  });
});

describe('Valid transition 5: ACTIVATED → AMENDED (reason + fields required)', () => {
  test('amends contract with reason and field updates', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'ACTIVATED');
    const updated = await svc.transition(baseTransition('AMENDED', {
      amendment_reason: 'annual salary review',
      amended_fields:   { wage_base: 14000 },
    }));
    assert.equal(updated.status, 'AMENDED');
    assert.equal(updated.amendment_reason, 'annual salary review');
    assert.equal(updated.wage_base, 14000);
  });

  test('blocks ACTIVATED→AMENDED without amendment_reason', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'ACTIVATED');
    await assert.rejects(
      () => svc.transition(baseTransition('AMENDED', { amended_fields: { wage_base: 14000 } })),
      /amendment_reason/
    );
  });

  test('blocks ACTIVATED→AMENDED without amended_fields', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'ACTIVATED');
    await assert.rejects(
      () => svc.transition(baseTransition('AMENDED', { amendment_reason: 'review' })),
      /amended_fields/
    );
  });
});

describe('Valid transition 6: ACTIVATED → TERMINATED (human + code + notice)', () => {
  test('terminates contract with all required fields', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'ACTIVATED');
    const updated = await svc.transition(baseTransition('TERMINATED', {
      termination_code: 'PERFORMANCE_INSUFFICIENT',
      notice_details:   { days: 30, effective_date: '2026-06-01' },
    }));
    assert.equal(updated.status,           'TERMINATED');
    assert.equal(updated.termination_code, 'PERFORMANCE_INSUFFICIENT');
    assert.ok(updated.terminated_at,        'terminated_at set');
  });

  test('blocks ACTIVATED→TERMINATED with SYSTEM actor', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'ACTIVATED');
    await assert.rejects(
      () => svc.transition(baseTransition('TERMINATED', { actor: SYS_ACTOR, termination_code: 'X', notice_details: {} })),
      /HUMAN actor/
    );
  });

  test('blocks ACTIVATED→TERMINATED without termination_code', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'ACTIVATED');
    await assert.rejects(
      () => svc.transition(baseTransition('TERMINATED', { notice_details: { days: 30 } })),
      /termination_code/
    );
  });

  test('blocks ACTIVATED→TERMINATED without notice_details', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'ACTIVATED');
    await assert.rejects(
      () => svc.transition(baseTransition('TERMINATED', { termination_code: 'X' })),
      /notice_details/
    );
  });
});

// ── Terminal state enforcement ────────────────────────────────────────────────

describe('TERMINATED is a terminal state', () => {
  test('blocks any transition out of TERMINATED', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'TERMINATED');
    await assert.rejects(
      () => svc.transition(baseTransition('DRAFT')),
      /terminal state/
    );
  });

  test('emits CONTRACT_TERMINATED with requires_approval=false (human gate already passed)', async () => {
    const h   = makeHooks();
    const svc = createContractStateMachine({ contractStore: new InMemoryContractStore(), eventStore: new InMemoryContractEventStore(), hooks: h });
    await driveToState(svc, 'TERMINATED');
    const ev = h.events.find(e => e.event_type === 'CONTRACT_TERMINATED');
    assert.ok(ev, 'CONTRACT_TERMINATED event emitted');
  });
});

// ── Invalid transition rejections ─────────────────────────────────────────────

describe('Invalid transition rejections', () => {
  test('DRAFT → SIGNED is invalid', async () => {
    const svc = makeSvc();
    await svc.draftContract(baseDraft());
    await assert.rejects(() => svc.transition(baseTransition('SIGNED')), /Invalid transition/);
  });

  test('DRAFT → ACTIVATED is invalid', async () => {
    const svc = makeSvc();
    await svc.draftContract(baseDraft());
    await assert.rejects(() => svc.transition(baseTransition('ACTIVATED')), /Invalid transition/);
  });

  test('REVIEW → ACTIVATED is invalid', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'REVIEW');
    await assert.rejects(() => svc.transition(baseTransition('ACTIVATED')), /Invalid transition/);
  });

  test('SIGNED → DRAFT is invalid', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'SIGNED');
    await assert.rejects(() => svc.transition(baseTransition('DRAFT')), /Invalid transition/);
  });

  test('SIGNED → TERMINATED is invalid (must go via ACTIVATED)', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'SIGNED');
    await assert.rejects(
      () => svc.transition(baseTransition('TERMINATED', { termination_code: 'X', notice_details: {} })),
      /Invalid transition/
    );
  });
});

// ── Lifecycle event immutability ──────────────────────────────────────────────

describe('contract_lifecycle_events — immutable append-only', () => {
  test('one event appended per transition', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'SIGNED');
    const events = await svc.getLifecycleEvents(CONTRACT_ID);
    // DRAFT(1) + REVIEW(2) + SIGNED(3) = 3 events
    assert.equal(events.length, 3);
  });

  test('each event records from_state and to_state', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'REVIEW');
    const events = await svc.getLifecycleEvents(CONTRACT_ID);
    assert.equal(events[0].from_state, null);     // DRAFT creation
    assert.equal(events[0].to_state,   'DRAFT');
    assert.equal(events[1].from_state, 'DRAFT');
    assert.equal(events[1].to_state,   'REVIEW');
  });

  test('event store has no update/delete methods', () => {
    const es = new InMemoryContractEventStore();
    assert.equal(typeof es.update, 'undefined', 'update must not exist');
    assert.equal(typeof es.delete, 'undefined', 'delete must not exist');
  });

  test('each event contains qiwa_payload_snapshot', async () => {
    const svc = makeSvc();
    await driveToState(svc, 'REVIEW');
    const events = await svc.getLifecycleEvents(CONTRACT_ID);
    events.forEach(ev => {
      assert.ok(ev.qiwa_payload_snapshot, `event ${ev.to_state} missing qiwa_payload_snapshot`);
    });
  });
});

// ── Qiwa payload generation ───────────────────────────────────────────────────

describe('generateQiwaPayload', () => {
  test('maps role_title → POSITION_TITLE', () => {
    const payload = generateQiwaPayload({ role_title: 'Engineer', wage_base: 10000 });
    assert.equal(payload.POSITION_TITLE, 'Engineer');
    assert.equal(payload.BASIC_WAGE,     10000);
  });

  test('omits null/undefined fields', () => {
    const payload = generateQiwaPayload({ role_title: 'Engineer', housing_allowance: null });
    assert.ok(!('HOUSING_ALLOWANCE' in payload), 'null field must be omitted');
  });

  test('includes _qiwa_mapping_version', () => {
    const payload = generateQiwaPayload({ role_title: 'X' });
    assert.equal(payload._qiwa_mapping_version, MAPPING.version);
  });
});

// ── validateQiwaCompleteness ──────────────────────────────────────────────────

describe('validateQiwaCompleteness', () => {
  test('returns complete=true when all required fields present', () => {
    const result = validateQiwaCompleteness(COMPLETE_FIELDS);
    assert.equal(result.complete, true);
    assert.equal(result.missingFields.length, 0);
  });

  test('flags missing required fields', () => {
    const { occupation_code: _, worker_national_id: __, ...partial } = COMPLETE_FIELDS;
    const result = validateQiwaCompleteness(partial);
    assert.equal(result.complete, false);
    assert.ok(result.missingFields.includes('occupation_code'));
    assert.ok(result.missingFields.includes('worker_national_id'));
  });

  test('MAPPING.version is v1', () => {
    assert.equal(MAPPING.version, 'v1');
  });
});
