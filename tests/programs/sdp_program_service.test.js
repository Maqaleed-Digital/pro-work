'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { createSdpProgramService } = require('../../app/modules/programs/sdp_program_service')
const templates = require('../../app/config/programs/sdp_pod_templates_v1.json')

// ---------------------------------------------------------------------------
// Mock pool — in-memory Maps for sdp_programs, sdp_pods, sdp_program_events
// ---------------------------------------------------------------------------
function createMockPool() {
  const programs = new Map()
  const pods = new Map()
  const events = new Map() // keyed by id, values have program_id for filtering

  function makeClient() {
    return {
      query(sql, params) {
        const text = sql.replace(/\s+/g, ' ').trim()

        // set_config (RLS)
        if (text.includes('set_config')) {
          return { rows: [{ set_config: params[0] }] }
        }

        // INSERT sdp_programs
        if (text.includes('INSERT INTO sdp_programs')) {
          const row = {
            id: params[0], tenant_id: params[1], name_en: params[2], name_ar: params[3],
            program_type: params[4], start_date: params[5], end_date: params[6],
            capacity_roles: params[7], budget_envelope_sar: params[8],
            compliance_flags_json: params[9], status: 'DRAFT',
            created_at: new Date(), updated_at: new Date(),
          }
          programs.set(row.id, row)
          return { rows: [row] }
        }

        // INSERT sdp_pods
        if (text.includes('INSERT INTO sdp_pods')) {
          const row = {
            id: params[0], tenant_id: params[1], program_id: params[2],
            template_type: params[3], template_version: params[4], name: params[5],
            capacity_roles: params[6], delivery_window_start: params[7],
            delivery_window_end: params[8], outcome_criteria_json: params[9],
            status: 'PLANNED', created_at: new Date(), updated_at: new Date(),
          }
          pods.set(row.id, row)
          return { rows: [row] }
        }

        // INSERT sdp_program_events
        if (text.includes('INSERT INTO sdp_program_events')) {
          const row = {
            id: params[0], tenant_id: params[1], program_id: params[2],
            event_type: params[3], actor_user_id: params[4], actor_type: params[5],
            payload: params[6], created_at: new Date(),
          }
          events.set(row.id, row)
          return { rows: [row] }
        }

        // SELECT from sdp_programs
        if (text.includes('FROM sdp_programs') && text.includes('WHERE id')) {
          const id = params[0]
          const row = programs.get(id)
          return { rows: row ? [row] : [] }
        }

        // SELECT from sdp_programs list
        if (text.includes('FROM sdp_programs') && !text.includes('WHERE id')) {
          const rows = [...programs.values()]
          if (params.length > 0) {
            return { rows: rows.filter(r => r.status === params[0]) }
          }
          return { rows: rows.sort((a, b) => new Date(a.start_date) - new Date(b.start_date)) }
        }

        // SELECT from sdp_pods by id
        if (text.includes('FROM sdp_pods') && text.includes('WHERE id')) {
          const row = pods.get(params[0])
          return { rows: row ? [row] : [] }
        }

        // SELECT from sdp_pods by program_id
        if (text.includes('FROM sdp_pods') && text.includes('WHERE program_id')) {
          return { rows: [...pods.values()].filter(p => p.program_id === params[0]) }
        }

        // SELECT from sdp_program_events
        if (text.includes('FROM sdp_program_events')) {
          const rows = [...events.values()]
            .filter(e => e.program_id === params[0])
            .sort((a, b) => a.created_at - b.created_at)
          return { rows }
        }

        // UPDATE sdp_programs
        if (text.includes('UPDATE sdp_programs')) {
          const id = params[params.length - 1]
          const row = programs.get(id)
          if (row) {
            row.status = params[0]
            row.updated_at = new Date()
          }
          return { rows: row ? [row] : [] }
        }

        // UPDATE sdp_pods
        if (text.includes('UPDATE sdp_pods')) {
          const id = params[params.length - 1]
          const row = pods.get(id)
          if (row) {
            row.status = params[0]
            row.updated_at = new Date()
          }
          return { rows: row ? [row] : [] }
        }

        return { rows: [] }
      },
      release() {},
    }
  }

  return {
    connect: async () => makeClient(),
    programs,
    pods,
    events,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TENANT = 'tn-unit-test'
const VALID_PAYLOAD = {
  name_en: 'Hajj Operations 2026',
  name_ar: 'عمليات الحج ٢٠٢٦',
  program_type: 'HAJJ_OPERATIONS',
  start_date: '2026-06-01',
  end_date: '2026-07-15',
  capacity_roles: 100,
  budget_envelope_sar: 5000000,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('SDP Program Service — unit tests', () => {
  let pool, svc

  beforeEach(() => {
    pool = createMockPool()
    svc = createSdpProgramService({ pool })
  })

  // 1 — Constructor rejects missing pool
  it('constructor rejects missing pool', () => {
    assert.throws(() => createSdpProgramService({}), /pool is required/)
    assert.throws(() => createSdpProgramService(null), /pool is required/)
  })

  // 2 — draftProgram happy path
  it('draftProgram creates a HAJJ_OPERATIONS program in DRAFT', async () => {
    const result = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    assert.equal(result.status, 'DRAFT')
    assert.equal(result.program_type, 'HAJJ_OPERATIONS')
    assert.equal(result.name_en, 'Hajj Operations 2026')
    assert.equal(result.name_ar, 'عمليات الحج ٢٠٢٦')
    assert.equal(result.tenant_id, TENANT)
    assert.ok(result.id)
  })

  // 3 — draftProgram requires name_en
  it('draftProgram rejects missing name_en (422)', async () => {
    const p = { ...VALID_PAYLOAD, name_en: '' }
    await assert.rejects(() => svc.draftProgram(TENANT, p, null), (err) => {
      assert.equal(err.status, 422)
      return true
    })
  })

  // 4 — draftProgram requires name_ar
  it('draftProgram rejects missing name_ar (422)', async () => {
    const p = { ...VALID_PAYLOAD, name_ar: '' }
    await assert.rejects(() => svc.draftProgram(TENANT, p, null), (err) => {
      assert.equal(err.status, 422)
      return true
    })
  })

  // 5 — draftProgram requires name_en AND name_ar together
  it('draftProgram rejects when both name_en and name_ar missing', async () => {
    const p = { ...VALID_PAYLOAD, name_en: '', name_ar: '' }
    await assert.rejects(() => svc.draftProgram(TENANT, p, null), (err) => {
      assert.equal(err.status, 422)
      return true
    })
  })

  // 6 — end_date > start_date
  it('draftProgram enforces end_date > start_date (422)', async () => {
    const p = { ...VALID_PAYLOAD, start_date: '2026-08-01', end_date: '2026-06-01' }
    await assert.rejects(() => svc.draftProgram(TENANT, p, null), (err) => {
      assert.equal(err.status, 422)
      assert.match(err.message, /end_date/)
      return true
    })
  })

  // 7 — duration > 730 days rejected
  it('draftProgram rejects duration > 730 days', async () => {
    const p = { ...VALID_PAYLOAD, start_date: '2026-01-01', end_date: '2028-02-01' }
    await assert.rejects(() => svc.draftProgram(TENANT, p, null), (err) => {
      assert.equal(err.status, 422)
      assert.match(err.message, /730/)
      return true
    })
  })

  // 8 — shift/attendance fields rejected
  it('draftProgram rejects shift field (422)', async () => {
    const p = { ...VALID_PAYLOAD, shift: 'morning' }
    await assert.rejects(() => svc.draftProgram(TENANT, p, null), (err) => {
      assert.equal(err.status, 422)
      assert.match(err.message, /shift/)
      return true
    })
  })

  it('draftProgram rejects attendance field (422)', async () => {
    const p = { ...VALID_PAYLOAD, attendance: true }
    await assert.rejects(() => svc.draftProgram(TENANT, p, null), (err) => {
      assert.equal(err.status, 422)
      return true
    })
  })

  it('draftProgram rejects clock_in field (422)', async () => {
    const p = { ...VALID_PAYLOAD, clock_in: '08:00' }
    await assert.rejects(() => svc.draftProgram(TENANT, p, null), (err) => {
      assert.equal(err.status, 422)
      return true
    })
  })

  it('draftProgram rejects roster field (422)', async () => {
    const p = { ...VALID_PAYLOAD, roster: ['A', 'B'] }
    await assert.rejects(() => svc.draftProgram(TENANT, p, null), (err) => {
      assert.equal(err.status, 422)
      return true
    })
  })

  // 9 — approveProgram requires DRAFT
  it('approveProgram requires DRAFT status (409)', async () => {
    const prog = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    await svc.approveProgram(TENANT, prog.id, null) // now APPROVED
    await assert.rejects(() => svc.approveProgram(TENANT, prog.id, null), (err) => {
      assert.equal(err.status, 409)
      return true
    })
  })

  // 10 — activateProgram requires APPROVED
  it('activateProgram requires APPROVED status (409)', async () => {
    const prog = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    await assert.rejects(() => svc.activateProgram(TENANT, prog.id, null), (err) => {
      assert.equal(err.status, 409)
      return true
    })
  })

  // 11 — windDown -> close transition path
  it('windDown then close transitions correctly', async () => {
    const prog = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    await svc.approveProgram(TENANT, prog.id, null)
    await svc.activateProgram(TENANT, prog.id, null)
    const wd = await svc.windDownProgram(TENANT, prog.id, null)
    assert.equal(wd.status, 'WOUND_DOWN')
    const cl = await svc.closeProgram(TENANT, prog.id, null)
    assert.equal(cl.status, 'CLOSED')
  })

  // 12 — cancelProgram from DRAFT
  it('cancelProgram from DRAFT succeeds', async () => {
    const prog = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    const r = await svc.cancelProgram(TENANT, prog.id, 'budget cut', null)
    assert.equal(r.status, 'CANCELLED')
  })

  // 13 — cancelProgram from APPROVED
  it('cancelProgram from APPROVED succeeds', async () => {
    const prog = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    await svc.approveProgram(TENANT, prog.id, null)
    const r = await svc.cancelProgram(TENANT, prog.id, 'scope change', null)
    assert.equal(r.status, 'CANCELLED')
  })

  // 14 — cancelProgram from ACTIVE
  it('cancelProgram from ACTIVE succeeds', async () => {
    const prog = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    await svc.approveProgram(TENANT, prog.id, null)
    await svc.activateProgram(TENANT, prog.id, null)
    const r = await svc.cancelProgram(TENANT, prog.id, 'emergency', null)
    assert.equal(r.status, 'CANCELLED')
  })

  // 15 — cancelProgram from CLOSED rejected (409)
  it('cancelProgram from CLOSED rejected (409)', async () => {
    const prog = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    await svc.approveProgram(TENANT, prog.id, null)
    await svc.activateProgram(TENANT, prog.id, null)
    await svc.windDownProgram(TENANT, prog.id, null)
    await svc.closeProgram(TENANT, prog.id, null)
    await assert.rejects(() => svc.cancelProgram(TENANT, prog.id, 'too late', null), (err) => {
      assert.equal(err.status, 409)
      return true
    })
  })

  // 16 — Invalid transitions rejected (e.g. DRAFT -> ACTIVE)
  it('invalid transition DRAFT -> ACTIVE rejected (409)', async () => {
    const prog = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    await assert.rejects(() => svc.activateProgram(TENANT, prog.id, null), (err) => {
      assert.equal(err.status, 409)
      return true
    })
  })

  // 17 — instantiatePod hydrates from EVENT_MEDIA template
  it('instantiatePod hydrates EVENT_MEDIA — capacity = sum of role counts', async () => {
    const prog = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    const tpl = templates.find(t => t.template_type === 'EVENT_MEDIA')
    const expectedCapacity = tpl.default_roles.reduce((s, r) => s + r.count, 0)
    const pod = await svc.instantiatePod(TENANT, prog.id, 'EVENT_MEDIA', null, null)
    assert.equal(pod.capacity_roles, expectedCapacity)
    assert.equal(pod.template_type, 'EVENT_MEDIA')
    assert.equal(pod.status, 'PLANNED')
  })

  // 18 — instantiatePod with overrides merges correctly
  it('instantiatePod with overrides merges correctly', async () => {
    const prog = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    const pod = await svc.instantiatePod(TENANT, prog.id, 'EVENT_MEDIA', {
      name: 'Custom Media Pod',
      capacity_roles: 50,
      outcome_criteria: [{ name: 'Custom KPI', target: 1, unit: 'per day' }],
      delivery_window_start: '2026-06-10',
      delivery_window_end: '2026-06-30',
    }, null)
    assert.equal(pod.name, 'Custom Media Pod')
    assert.equal(pod.capacity_roles, 50)
    assert.equal(pod.delivery_window_start, '2026-06-10')
  })

  // 19 — instantiatePod requires outcome_criteria (422)
  it('instantiatePod requires outcome_criteria for CUSTOM (422)', async () => {
    const prog = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    await assert.rejects(
      () => svc.instantiatePod(TENANT, prog.id, 'CUSTOM', { outcome_criteria: [] }, null),
      (err) => { assert.equal(err.status, 422); return true }
    )
  })

  // 20 — instantiatePod requires delivery_window dates (422)
  it('instantiatePod requires delivery_window dates (422)', async () => {
    const prog = await svc.draftProgram(TENANT, { ...VALID_PAYLOAD }, null)
    // The service falls back to program dates, so no error if program has dates.
    // Force missing by using a program with null dates (mock: we directly clear them).
    pool.programs.get([...pool.programs.keys()][0]).start_date = null
    pool.programs.get([...pool.programs.keys()][0]).end_date = null
    await assert.rejects(
      () => svc.instantiatePod(TENANT, [...pool.programs.keys()][0], 'CUSTOM', {
        outcome_criteria: [{ name: 'x', target: 1, unit: 'y' }],
      }, null),
      (err) => { assert.equal(err.status, 422); return true }
    )
  })

  // 21 — instantiatePod emits POD_INSTANTIATED
  it('instantiatePod emits POD_INSTANTIATED event', async () => {
    const prog = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    await svc.instantiatePod(TENANT, prog.id, 'MULTILINGUAL_SUPPORT', null, null)
    const evts = [...pool.events.values()].filter(e => e.event_type === 'POD_INSTANTIATED')
    assert.equal(evts.length, 1)
    assert.equal(evts[0].program_id, prog.id)
  })

  // 22 — completePod transitions PLANNED -> COMPLETED
  it('completePod transitions PLANNED to COMPLETED', async () => {
    const prog = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    const pod = await svc.instantiatePod(TENANT, prog.id, 'EVENT_MEDIA', null, null)
    const r = await svc.completePod(TENANT, pod.id, null)
    assert.equal(r.status, 'COMPLETED')
  })

  // 23 — sdp_program_events UPDATE blocked (no UPDATE SQL emitted)
  it('sdp_program_events — no UPDATE SQL emitted by service', async () => {
    const queries = []
    const spyPool = {
      connect: async () => ({
        query(sql, params) {
          queries.push(sql)
          return pool.connect().then(c => c.query(sql, params))
        },
        release() {},
      }),
    }
    const spySvc = createSdpProgramService({ pool: spyPool })
    await spySvc.draftProgram(TENANT, VALID_PAYLOAD, null)
    const updateOnEvents = queries.filter(q =>
      q.toLowerCase().includes('update') && q.toLowerCase().includes('sdp_program_events')
    )
    assert.equal(updateOnEvents.length, 0, 'No UPDATE on sdp_program_events')
  })

  // 24 — sdp_program_events DELETE blocked
  it('sdp_program_events — no DELETE SQL emitted by service', async () => {
    const queries = []
    const spyPool = {
      connect: async () => ({
        query(sql, params) {
          queries.push(sql)
          return pool.connect().then(c => c.query(sql, params))
        },
        release() {},
      }),
    }
    const spySvc = createSdpProgramService({ pool: spyPool })
    const prog = await spySvc.draftProgram(TENANT, VALID_PAYLOAD, null)
    await spySvc.approveProgram(TENANT, prog.id, null)
    const deleteOnEvents = queries.filter(q =>
      q.toLowerCase().includes('delete') && q.toLowerCase().includes('sdp_program_events')
    )
    assert.equal(deleteOnEvents.length, 0, 'No DELETE on sdp_program_events')
  })

  // 25 — Actor discipline: all HUMAN
  it('all events have actor_type HUMAN', async () => {
    const prog = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    await svc.approveProgram(TENANT, prog.id, null)
    await svc.activateProgram(TENANT, prog.id, null)
    const allEvents = [...pool.events.values()]
    for (const e of allEvents) {
      assert.equal(e.actor_type, 'HUMAN', `event ${e.event_type} must be HUMAN`)
    }
  })

  // 26 — RLS set_config called
  it('RLS set_config called with tenant ID', async () => {
    const configCalls = []
    const rlsPool = {
      connect: async () => ({
        query(sql, params) {
          if (sql.includes('set_config')) {
            configCalls.push(params[0])
          }
          return pool.connect().then(c => c.query(sql, params))
        },
        release() {},
      }),
    }
    const rlsSvc = createSdpProgramService({ pool: rlsPool })
    await rlsSvc.draftProgram(TENANT, VALID_PAYLOAD, null)
    assert.ok(configCalls.includes(TENANT), 'set_config must be called with tenant ID')
  })

  // 27 — Timeline returns events chronologically
  it('timeline returns events chronologically', async () => {
    const prog = await svc.draftProgram(TENANT, VALID_PAYLOAD, null)
    await svc.approveProgram(TENANT, prog.id, null)
    await svc.activateProgram(TENANT, prog.id, null)
    const timeline = await svc.getProgramTimeline(TENANT, prog.id)
    assert.ok(timeline.length >= 3)
    for (let i = 1; i < timeline.length; i++) {
      assert.ok(
        new Date(timeline[i].created_at) >= new Date(timeline[i - 1].created_at),
        'events must be chronologically ordered'
      )
    }
  })
})
