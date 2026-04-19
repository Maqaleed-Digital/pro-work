'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const { createOffboardingPgService } = require('../../app/modules/compliance/offboarding_pg_service')
const checklist = require('../../app/config/compliance/offboarding_checklist_v1.json')

// ── fixtures ────────────────────────────────────────────────────────────────

const TENANT       = 'tn-unit-offboard-001'
const CONTRACT_ID  = 'CTR-OFF-1'
const CANDIDATE_ID = 'C1'
const ACTOR_ID     = 'usr-actor-off-001'
const WPS_ID       = 'wps-off-001'
const PROB_ID      = 'prob-off-001'
const ESB_ID       = 'esb-off-001'

const HANDOVER_ITEMS   = checklist.items.filter(i => i.phase === 'HANDOVER')
const SETTLEMENT_ITEMS = checklist.items.filter(i => i.phase === 'SETTLEMENT')
const ALL_ITEMS        = checklist.items

// ── mock pool ───────────────────────────────────────────────────────────────

function createMockPool(opts = {}) {
  const offboardings = new Map()
  const events       = new Map()    // offId -> [event, ...]
  const contracts    = new Map()
  const evidencePacks = new Map()
  const setCalls     = []
  let currentTenant  = null

  const qiwa = opts.qiwa || {
    notice_period_days: 30,
    candidate_id: CANDIDATE_ID,
  }

  contracts.set(CONTRACT_ID, {
    id: CONTRACT_ID,
    tenant_id: TENANT,
    candidate_id: CANDIDATE_ID,
    status: 'ACTIVATED',
    qiwa_parity_json: JSON.stringify(qiwa),
  })

  if (opts.extraContracts) {
    for (const c of opts.extraContracts) contracts.set(c.id, c)
  }

  const wpsRows = new Map()
  wpsRows.set(CONTRACT_ID, { id: WPS_ID })

  const probRows = new Map()
  probRows.set(CONTRACT_ID, { id: PROB_ID })

  const esbRows = new Map()
  if (!opts.noEsb) {
    esbRows.set(CONTRACT_ID, { id: ESB_ID, status: 'FINALIZED' })
  }

  const esbById = new Map()
  esbById.set(ESB_ID, { id: ESB_ID, status: 'FINALIZED' })
  if (opts.draftEsb) {
    esbById.set(opts.draftEsb, { id: opts.draftEsb, status: 'DRAFT' })
  }

  const mockClient = {
    query(sql, params) {
      // set_config for RLS
      if (/set_config/i.test(sql)) {
        currentTenant = params[0]
        setCalls.push({ tenant: params[0] })
        return { rows: [{}] }
      }

      // SELECT contract by id
      if (/FROM contracts WHERE id/i.test(sql)) {
        const c = contracts.get(params[0])
        return { rows: c ? [c] : [] }
      }

      // SELECT wps_readiness_packs
      if (/FROM wps_readiness_packs WHERE contract_id/i.test(sql)) {
        const w = wpsRows.get(params[0])
        return { rows: w ? [w] : [] }
      }

      // SELECT probation_records
      if (/FROM probation_records WHERE contract_id/i.test(sql)) {
        const p = probRows.get(params[0])
        return { rows: p ? [p] : [] }
      }

      // SELECT esb_calculations by contract_id (for initiate)
      if (/FROM esb_calculations WHERE contract_id/i.test(sql)) {
        const e = esbRows.get(params[0])
        return { rows: e ? [e] : [] }
      }

      // SELECT esb_calculations by id (for linkEsbCalculation)
      if (/FROM esb_calculations WHERE id/i.test(sql)) {
        const e = esbById.get(params[0])
        return { rows: e ? [e] : [] }
      }

      // INSERT INTO offboardings
      if (/INSERT INTO offboardings/i.test(sql)) {
        const rec = {
          id: params[0], tenant_id: params[1], contract_id: params[2],
          candidate_id: params[3], wps_readiness_pack_id: params[4],
          probation_record_id: params[5], esb_calculation_id: params[6],
          status: 'INITIATED', reason_type: params[7], reason_text: params[8],
          notice_period_days: params[9], notice_served_from: params[10],
          notice_served_until: params[11], last_working_day: params[12],
          checklist_state_json: params[13], approvals_json: params[14],
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }
        offboardings.set(rec.id, rec)
        events.set(rec.id, [])
        return { rows: [rec] }
      }

      // SELECT offboarding by id — return a shallow copy to avoid aliasing
      // (the service reads off.status before UPDATE, but our mock UPDATE mutates
      //  the stored object; returning a copy preserves the real DB semantics where
      //  SELECT returns a snapshot and UPDATE does not retroactively change it)
      if (/FROM offboardings WHERE id/i.test(sql)) {
        const o = offboardings.get(params[0])
        return { rows: o ? [{ ...o }] : [] }
      }

      // UPDATE offboardings
      if (/UPDATE offboardings SET checklist_state_json/i.test(sql)) {
        const off = offboardings.get(params[2])
        if (off) {
          off.checklist_state_json = params[0]
          off.status = params[1]
        }
        return { rows: [] }
      }
      if (/UPDATE offboardings SET approvals_json/i.test(sql)) {
        const off = offboardings.get(params[2])
        if (off) {
          off.approvals_json = params[0]
          off.status = params[1]
        }
        return { rows: [] }
      }
      if (/UPDATE offboardings SET esb_calculation_id/i.test(sql)) {
        const off = offboardings.get(params[1])
        if (off) off.esb_calculation_id = params[0]
        return { rows: [] }
      }
      if (/UPDATE offboardings SET status.*evidence_pack_id/i.test(sql)) {
        const off = offboardings.get(params[3])
        if (off) {
          off.status = params[0]
          off.evidence_pack_id = params[1]
          off.finalized_by = params[2]
        }
        return { rows: [] }
      }
      if (/UPDATE offboardings SET status.*cancelled_reason/i.test(sql)) {
        const off = offboardings.get(params[2])
        if (off) {
          off.status = params[0]
          off.cancelled_reason = params[1]
        }
        return { rows: [] }
      }

      // INSERT INTO offboarding_events
      if (/INSERT INTO offboarding_events/i.test(sql)) {
        const ev = {
          id: params[0], tenant_id: params[1], offboarding_id: params[2],
          event_type: params[3], previous_status: params[4], new_status: params[5],
          actor_user_id: params[6], actor_type: params[7], payload: params[8],
          created_at: new Date().toISOString(),
        }
        const arr = events.get(params[2]) || []
        arr.push(ev)
        events.set(params[2], arr)
        return { rows: [ev] }
      }

      // SELECT offboarding_events
      if (/FROM offboarding_events WHERE offboarding_id/i.test(sql)) {
        return { rows: events.get(params[0]) || [] }
      }

      // UPDATE contracts (finalize terminates)
      if (/UPDATE contracts SET status/i.test(sql)) {
        const c = contracts.get(params[2])
        if (c) {
          c.status = params[0]
          c.termination_reason = params[1]
        }
        return { rows: [] }
      }

      // INSERT INTO evidence_packs
      if (/INSERT INTO evidence_packs/i.test(sql)) {
        const pack = {
          pack_id: params[0], pack_type: 'EP_WOS_OFFBOARD_01',
          tenant_id: params[1], status: 'CLOSED',
          actor: params[2], action: 'OFFBOARDING_FINALIZED',
          data_snapshot: params[3], immutable_hash: params[4],
        }
        evidencePacks.set(params[0], pack)
        return { rows: [pack] }
      }

      // SELECT evidence_packs (for finalize snapshot queries)
      // wps_readiness_packs by id
      if (/FROM wps_readiness_packs WHERE id/i.test(sql)) {
        return { rows: [{ id: params[0], data: 'wps-snapshot' }] }
      }
      // probation_records by id
      if (/FROM probation_records WHERE id/i.test(sql)) {
        return { rows: [{ id: params[0], data: 'probation-snapshot' }] }
      }

      return { rows: [] }
    },
    release() {},
  }

  return {
    connect() { return Promise.resolve(mockClient) },
    _offboardings: offboardings,
    _events: events,
    _contracts: contracts,
    _evidencePacks: evidencePacks,
    _setCalls: setCalls,
    _mockClient: mockClient,
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

async function initiateDefault(svc) {
  return svc.initiate(TENANT, CONTRACT_ID, 'RESIGNATION', 'Voluntary resignation', '2026-05-01', ACTOR_ID)
}

async function completeAllChecklistItems(svc, offId, opts = {}) {
  // Must complete hr_notification_received first (prerequisite for access_revocation_scheduled)
  await svc.completeChecklistItem(TENANT, offId, 'hr_notification_received', ACTOR_ID, false)

  for (const item of ALL_ITEMS) {
    if (item.key === 'hr_notification_received') continue // already done
    const isNa = (item.key === 'exit_interview_completed' && opts.exitInterviewNa !== false)
    await svc.completeChecklistItem(TENANT, offId, item.key, ACTOR_ID, isNa)
  }
}

async function recordAllApprovals(svc, offId) {
  await svc.recordApproval(TENANT, offId, 'hr', null)
  await svc.recordApproval(TENANT, offId, 'finance', null)
  await svc.recordApproval(TENANT, offId, 'manager', null)
}

// ── constructor / RLS ───────────────────────────────────────────────────────

test('constructor rejects missing pool', () => {
  assert.throws(() => createOffboardingPgService({}), /pool is required/)
  assert.throws(() => createOffboardingPgService(null), /pool is required/)
  assert.throws(() => createOffboardingPgService(), /pool is required/)
})

test('RLS: set_config called on every operation', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  await initiateDefault(svc)
  assert.ok(pool._setCalls.length >= 1, 'set_config must be called')
  assert.strictEqual(pool._setCalls[0].tenant, TENANT)
})

// ── initiate ────────────────────────────────────────────────────────────────

test('initiate: happy path returns INITIATED offboarding', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  assert.ok(off.id)
  assert.strictEqual(off.status, 'INITIATED')
  assert.strictEqual(off.reason_type, 'RESIGNATION')
  assert.strictEqual(off.reason_text, 'Voluntary resignation')
  assert.strictEqual(off.candidate_id, CANDIDATE_ID)
  assert.strictEqual(off.notice_period_days, 30)
})

test('initiate: requires reason_text (422 without)', async () => {
  const svc = createOffboardingPgService({ pool: createMockPool() })
  await assert.rejects(
    () => svc.initiate(TENANT, CONTRACT_ID, 'RESIGNATION', '', '2026-05-01', ACTOR_ID),
    (err) => err.status === 422 && /reason_text/i.test(err.message)
  )
  await assert.rejects(
    () => svc.initiate(TENANT, CONTRACT_ID, 'RESIGNATION', null, '2026-05-01', ACTOR_ID),
    (err) => err.status === 422
  )
})

test('initiate: loads contract with qiwa_parity_json notice_period_days', async () => {
  const pool = createMockPool({ qiwa: { notice_period_days: 60 } })
  const svc  = createOffboardingPgService({ pool })
  const off  = await svc.initiate(TENANT, CONTRACT_ID, 'RESIGNATION', 'test', '2026-05-01', ACTOR_ID)
  assert.strictEqual(off.notice_period_days, 60)
})

test('initiate: links WPS readiness pack', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  assert.strictEqual(off.wps_readiness_pack_id, WPS_ID)
})

test('initiate: links probation record', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  assert.strictEqual(off.probation_record_id, PROB_ID)
})

test('initiate: links finalized ESB calculation', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  assert.strictEqual(off.esb_calculation_id, ESB_ID)
})

test('initiate: ESB null when none finalized', async () => {
  const pool = createMockPool({ noEsb: true })
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  assert.strictEqual(off.esb_calculation_id, null)
})

test('initiate: emits OFFBOARDING_INITIATED event with HUMAN actor_type', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  const evts = pool._events.get(off.id)
  assert.ok(evts.length >= 1)
  assert.strictEqual(evts[0].event_type, 'OFFBOARDING_INITIATED')
  assert.strictEqual(evts[0].actor_type, 'HUMAN')
})

test('initiate: checklist_state_json initializes all items as PENDING', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  const state = typeof off.checklist_state_json === 'string'
    ? JSON.parse(off.checklist_state_json) : off.checklist_state_json
  for (const item of ALL_ITEMS) {
    assert.strictEqual(state[item.key].status, 'PENDING')
  }
})

// ── completeChecklistItem ───────────────────────────────────────────────────

test('completeChecklistItem: enforces prerequisite (access_revocation requires hr_notification first)', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await assert.rejects(
    () => svc.completeChecklistItem(TENANT, off.id, 'access_revocation_scheduled', ACTOR_ID, false),
    (err) => err.status === 409 && /prerequisite/i.test(err.message)
  )
})

test('completeChecklistItem: succeeds after prerequisite met', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await svc.completeChecklistItem(TENANT, off.id, 'hr_notification_received', ACTOR_ID, false)
  const result = await svc.completeChecklistItem(TENANT, off.id, 'access_revocation_scheduled', ACTOR_ID, false)
  assert.ok(result.itemKey, 'access_revocation_scheduled')
})

test('completeChecklistItem: marks N/A when allowed (exit_interview)', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  const result = await svc.completeChecklistItem(TENANT, off.id, 'exit_interview_completed', ACTOR_ID, true)
  assert.strictEqual(result.itemKey, 'exit_interview_completed')
  // Verify state was set to N/A
  const stored = pool._offboardings.get(off.id)
  const state = typeof stored.checklist_state_json === 'string'
    ? JSON.parse(stored.checklist_state_json) : stored.checklist_state_json
  assert.strictEqual(state.exit_interview_completed.status, 'N/A')
})

test('completeChecklistItem: rejects N/A when not allowed (hr_notification)', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await assert.rejects(
    () => svc.completeChecklistItem(TENANT, off.id, 'hr_notification_received', ACTOR_ID, true),
    (err) => err.status === 422 && /does not allow N\/A/i.test(err.message)
  )
})

test('completeChecklistItem: rejects unknown item key', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await assert.rejects(
    () => svc.completeChecklistItem(TENANT, off.id, 'nonexistent_item', ACTOR_ID, false),
    (err) => err.status === 422
  )
})

test('completeChecklistItem: phase transition — all HANDOVER items → SETTLEMENT_PENDING', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)

  // Complete hr_notification_received first (prereq for access_revocation_scheduled)
  await svc.completeChecklistItem(TENANT, off.id, 'hr_notification_received', ACTOR_ID, false)

  // Complete remaining HANDOVER items
  let result
  for (const item of HANDOVER_ITEMS) {
    if (item.key === 'hr_notification_received') continue
    result = await svc.completeChecklistItem(TENANT, off.id, item.key, ACTOR_ID, false)
  }
  assert.strictEqual(result.newStatus, 'SETTLEMENT_PENDING')
})

test('completeChecklistItem: emits event with HUMAN actor_type', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await svc.completeChecklistItem(TENANT, off.id, 'hr_notification_received', ACTOR_ID, false)
  const evts = pool._events.get(off.id)
  const checklistEvt = evts.find(e => e.event_type === 'CHECKLIST_ITEM_COMPLETED')
  assert.ok(checklistEvt)
  assert.strictEqual(checklistEvt.actor_type, 'HUMAN')
})

// ── linkEsbCalculation ──────────────────────────────────────────────────────

test('linkEsbCalculation: requires FINALIZED ESB', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  const result = await svc.linkEsbCalculation(TENANT, off.id, ESB_ID)
  assert.strictEqual(result.esb_linked, true)
})

test('linkEsbCalculation: rejects DRAFT ESB (409)', async () => {
  const DRAFT_ESB = 'esb-draft-001'
  const pool = createMockPool({ draftEsb: DRAFT_ESB })
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await assert.rejects(
    () => svc.linkEsbCalculation(TENANT, off.id, DRAFT_ESB),
    (err) => err.status === 409 && /FINALIZED/i.test(err.message)
  )
})

test('linkEsbCalculation: emits ESB_LINKED event', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await svc.linkEsbCalculation(TENANT, off.id, ESB_ID)
  const evts = pool._events.get(off.id)
  assert.ok(evts.some(e => e.event_type === 'ESB_LINKED'))
})

// ── recordApproval ──────────────────────────────────────────────────────────

test('recordApproval: records hr approval', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  const result = await svc.recordApproval(TENANT, off.id, 'hr', ACTOR_ID)
  assert.strictEqual(result.approvalType, 'hr')
})

test('recordApproval: records finance approval', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  const result = await svc.recordApproval(TENANT, off.id, 'finance', ACTOR_ID)
  assert.strictEqual(result.approvalType, 'finance')
})

test('recordApproval: records manager approval', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  const result = await svc.recordApproval(TENANT, off.id, 'manager', ACTOR_ID)
  assert.strictEqual(result.approvalType, 'manager')
})

test('recordApproval: all 3 approvals + all required items → READY_TO_FINALIZE with SYSTEM READY_FLAGGED event', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)

  await completeAllChecklistItems(svc, off.id)
  const result = await recordAllApprovals(svc, off.id)

  const stored = pool._offboardings.get(off.id)
  assert.strictEqual(stored.status, 'READY_TO_FINALIZE')

  const evts = pool._events.get(off.id)
  const readyEvt = evts.find(e => e.event_type === 'READY_FLAGGED')
  assert.ok(readyEvt, 'READY_FLAGGED event must exist')
  assert.strictEqual(readyEvt.actor_type, 'SYSTEM')
  assert.strictEqual(readyEvt.new_status, 'READY_TO_FINALIZE')
})

// ── finalize ────────────────────────────────────────────────────────────────

test('finalize: requires READY_TO_FINALIZE (409 otherwise)', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await assert.rejects(
    () => svc.finalize(TENANT, off.id, ACTOR_ID),
    (err) => err.status === 409 && /READY_TO_FINALIZE/i.test(err.message)
  )
})

test('finalize: generates EP-WOS-OFFBOARD-01 evidence pack', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await completeAllChecklistItems(svc, off.id)
  await recordAllApprovals(svc, off.id)

  const result = await svc.finalize(TENANT, off.id, ACTOR_ID)
  assert.strictEqual(result.status, 'FINALIZED')
  assert.ok(result.evidence_pack_id)
  assert.ok(result.pack_hash)

  // Verify evidence pack was inserted
  const pack = pool._evidencePacks.get(result.evidence_pack_id)
  assert.ok(pack)
  assert.strictEqual(pack.pack_type, 'EP_WOS_OFFBOARD_01')
})

test('finalize: evidence pack snapshot contains contract+WPS+probation+ESB+offboarding+events', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await completeAllChecklistItems(svc, off.id)
  await recordAllApprovals(svc, off.id)

  const result = await svc.finalize(TENANT, off.id, ACTOR_ID)
  const pack = pool._evidencePacks.get(result.evidence_pack_id)
  const snapshot = JSON.parse(pack.data_snapshot)

  assert.ok(snapshot.contract, 'snapshot must contain contract')
  assert.ok(snapshot.wps_readiness, 'snapshot must contain wps_readiness')
  assert.ok(snapshot.probation, 'snapshot must contain probation')
  assert.ok(snapshot.esb_calculation, 'snapshot must contain esb_calculation')
  assert.ok(snapshot.offboarding, 'snapshot must contain offboarding')
  assert.ok(snapshot.events, 'snapshot must contain events')
})

test('finalize: transitions contract to TERMINATED', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await completeAllChecklistItems(svc, off.id)
  await recordAllApprovals(svc, off.id)
  await svc.finalize(TENANT, off.id, ACTOR_ID)

  const contract = pool._contracts.get(CONTRACT_ID)
  assert.strictEqual(contract.status, 'TERMINATED')
})

test('finalize: idempotent or 409 on second call', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await completeAllChecklistItems(svc, off.id)
  await recordAllApprovals(svc, off.id)
  await svc.finalize(TENANT, off.id, ACTOR_ID)

  // Second finalize: offboarding is now FINALIZED, not READY_TO_FINALIZE → 409
  await assert.rejects(
    () => svc.finalize(TENANT, off.id, ACTOR_ID),
    (err) => err.status === 409
  )
})

test('finalize: emits FINALIZED (HUMAN) and EVIDENCE_PACK_GENERATED (SYSTEM) events', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await completeAllChecklistItems(svc, off.id)
  await recordAllApprovals(svc, off.id)
  await svc.finalize(TENANT, off.id, ACTOR_ID)

  const evts = pool._events.get(off.id)
  const finEvt = evts.find(e => e.event_type === 'FINALIZED')
  assert.ok(finEvt)
  assert.strictEqual(finEvt.actor_type, 'HUMAN')

  const epEvt = evts.find(e => e.event_type === 'EVIDENCE_PACK_GENERATED')
  assert.ok(epEvt)
  assert.strictEqual(epEvt.actor_type, 'SYSTEM')
})

// ── cancel ──────────────────────────────────────────────────────────────────

test('cancel: emits CANCELLED event with reason', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await svc.cancel(TENANT, off.id, 'Changed plans', ACTOR_ID)

  const stored = pool._offboardings.get(off.id)
  assert.strictEqual(stored.status, 'CANCELLED')

  const evts = pool._events.get(off.id)
  const cancelEvt = evts.find(e => e.event_type === 'CANCELLED')
  assert.ok(cancelEvt)
  assert.strictEqual(cancelEvt.actor_type, 'HUMAN')
})

test('cancel: requires reason (422)', async () => {
  const svc = createOffboardingPgService({ pool: createMockPool() })
  const off = await initiateDefault(svc)
  await assert.rejects(
    () => svc.cancel(TENANT, off.id, '', ACTOR_ID),
    (err) => err.status === 422 && /reason/i.test(err.message)
  )
  await assert.rejects(
    () => svc.cancel(TENANT, off.id, null, ACTOR_ID),
    (err) => err.status === 422
  )
})

test('cancel: cannot cancel FINALIZED (409)', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await completeAllChecklistItems(svc, off.id)
  await recordAllApprovals(svc, off.id)
  await svc.finalize(TENANT, off.id, ACTOR_ID)

  await assert.rejects(
    () => svc.cancel(TENANT, off.id, 'Too late', ACTOR_ID),
    (err) => err.status === 409 && /finalized/i.test(err.message)
  )
})

// ── audit: append-only events (INSERT only SQL) ─────────────────────────────

test('audit: offboarding_events use INSERT only (no UPDATE/DELETE in service)', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await completeAllChecklistItems(svc, off.id)
  await recordAllApprovals(svc, off.id)
  await svc.finalize(TENANT, off.id, ACTOR_ID)

  // Inspect all queries that touched offboarding_events — all should be INSERT
  const evts = pool._events.get(off.id)
  assert.ok(evts.length > 0, 'events must be present')
  // The mock only captures INSERT calls for events; if UPDATE/DELETE existed the mock would not have handled them
  // Verify by reading the source — the service only ever does INSERT INTO offboarding_events
  const fs = require('fs')
  const src = fs.readFileSync(require.resolve('../../app/modules/compliance/offboarding_pg_service'), 'utf8')
  const eventOps = src.match(/offboarding_events/g) || []
  assert.ok(eventOps.length > 0)
  assert.ok(!/UPDATE.*offboarding_events/i.test(src), 'service must not UPDATE offboarding_events')
  assert.ok(!/DELETE.*offboarding_events/i.test(src), 'service must not DELETE offboarding_events')
})

test('audit: HUMAN actor_type for user actions', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await svc.completeChecklistItem(TENANT, off.id, 'hr_notification_received', ACTOR_ID, false)
  await svc.cancel(TENANT, off.id, 'test reason', ACTOR_ID)

  const evts = pool._events.get(off.id)
  const userEvents = evts.filter(e => ['OFFBOARDING_INITIATED', 'CHECKLIST_ITEM_COMPLETED', 'CANCELLED'].includes(e.event_type))
  assert.ok(userEvents.length >= 3)
  for (const e of userEvents) {
    assert.strictEqual(e.actor_type, 'HUMAN', `${e.event_type} must have HUMAN actor_type`)
  }
})

test('audit: SYSTEM actor_type for READY_FLAGGED and EVIDENCE_PACK_GENERATED', async () => {
  const pool = createMockPool()
  const svc  = createOffboardingPgService({ pool })
  const off  = await initiateDefault(svc)
  await completeAllChecklistItems(svc, off.id)
  await recordAllApprovals(svc, off.id)
  await svc.finalize(TENANT, off.id, ACTOR_ID)

  const evts = pool._events.get(off.id)
  const systemEvents = evts.filter(e => ['READY_FLAGGED', 'EVIDENCE_PACK_GENERATED'].includes(e.event_type))
  assert.strictEqual(systemEvents.length, 2)
  for (const e of systemEvents) {
    assert.strictEqual(e.actor_type, 'SYSTEM', `${e.event_type} must have SYSTEM actor_type`)
  }
})
