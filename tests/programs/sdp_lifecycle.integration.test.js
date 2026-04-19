'use strict'

const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')

const DATABASE_URL = process.env.DATABASE_URL
const SKIP = !DATABASE_URL

describe('SDP Lifecycle — integration', { skip: SKIP && 'DATABASE_URL not set' }, () => {
  const { createSdpProgramService } = require('../../app/modules/programs/sdp_program_service')
  const templates = require('../../app/config/programs/sdp_pod_templates_v1.json')
  const pg = require('pg')

  const TENANT = 'tn-e04ac090'
  const ACTOR_USER_ID = null // FK to users — null for integration tests

  let pool, svc
  let programId
  const podIds = {}
  const eventIds = []

  before(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL })
    svc = createSdpProgramService({ pool })
  })

  after(async () => {
    if (pool) await pool.end()
  })

  // 1 — Draft program
  it('draft "Hajj Operations 2026" bilingual, HAJJ_OPERATIONS', async () => {
    const prog = await svc.draftProgram(TENANT, {
      name_en: 'Hajj Operations 2026',
      name_ar: 'عمليات الحج ٢٠٢٦',
      program_type: 'HAJJ_OPERATIONS',
      start_date: '2026-06-01',
      end_date: '2026-07-15',
      capacity_roles: 100,
      budget_envelope_sar: 5000000,
    }, ACTOR_USER_ID)
    programId = prog.id
    assert.ok(programId, 'program ID returned')
    assert.equal(prog.status, 'DRAFT')
    assert.equal(prog.name_en, 'Hajj Operations 2026')
    assert.equal(prog.name_ar, 'عمليات الحج ٢٠٢٦')
    assert.equal(prog.program_type, 'HAJJ_OPERATIONS')
  })

  // 2 — Approve
  it('approve program', async () => {
    const r = await svc.approveProgram(TENANT, programId, ACTOR_USER_ID)
    assert.equal(r.status, 'APPROVED')
  })

  // 3 — Activate
  it('activate program', async () => {
    const r = await svc.activateProgram(TENANT, programId, ACTOR_USER_ID)
    assert.equal(r.status, 'ACTIVE')
  })

  // 4 — Instantiate 3 pods
  it('instantiate EVENT_MEDIA pod with template hydration', async () => {
    const tpl = templates.find(t => t.template_type === 'EVENT_MEDIA')
    const expectedCapacity = tpl.default_roles.reduce((s, r) => s + r.count, 0)
    const pod = await svc.instantiatePod(TENANT, programId, 'EVENT_MEDIA', null, ACTOR_USER_ID)
    podIds.EVENT_MEDIA = pod.id
    assert.ok(pod.id)
    assert.equal(pod.capacity_roles, expectedCapacity, `EVENT_MEDIA capacity = ${expectedCapacity}`)
    assert.equal(pod.template_type, 'EVENT_MEDIA')
  })

  it('instantiate MULTILINGUAL_SUPPORT pod with template hydration', async () => {
    const tpl = templates.find(t => t.template_type === 'MULTILINGUAL_SUPPORT')
    const expectedCapacity = tpl.default_roles.reduce((s, r) => s + r.count, 0)
    const pod = await svc.instantiatePod(TENANT, programId, 'MULTILINGUAL_SUPPORT', null, ACTOR_USER_ID)
    podIds.MULTILINGUAL_SUPPORT = pod.id
    assert.equal(pod.capacity_roles, expectedCapacity, `MULTILINGUAL_SUPPORT capacity = ${expectedCapacity}`)
  })

  it('instantiate DIGITAL_OPERATIONS pod with template hydration', async () => {
    const tpl = templates.find(t => t.template_type === 'DIGITAL_OPERATIONS')
    const expectedCapacity = tpl.default_roles.reduce((s, r) => s + r.count, 0)
    const pod = await svc.instantiatePod(TENANT, programId, 'DIGITAL_OPERATIONS', null, ACTOR_USER_ID)
    podIds.DIGITAL_OPERATIONS = pod.id
    assert.equal(pod.capacity_roles, expectedCapacity, `DIGITAL_OPERATIONS capacity = ${expectedCapacity}`)
  })

  // 5 — Complete one pod (EVENT_MEDIA)
  it('complete EVENT_MEDIA pod', async () => {
    const r = await svc.completePod(TENANT, podIds.EVENT_MEDIA, ACTOR_USER_ID)
    assert.equal(r.status, 'COMPLETED')
  })

  // 6 — Query events and assert full chain
  it('event chain: DRAFTED -> APPROVED -> ACTIVATED -> POD_INSTANTIATED x3 -> POD_COMPLETED', async () => {
    const timeline = await svc.getProgramTimeline(TENANT, programId)
    const types = timeline.map(e => e.event_type)

    assert.equal(types[0], 'PROGRAM_DRAFTED')
    assert.equal(types[1], 'PROGRAM_APPROVED')
    assert.equal(types[2], 'PROGRAM_ACTIVATED')

    const podInstantiated = types.filter(t => t === 'POD_INSTANTIATED')
    assert.equal(podInstantiated.length, 3, '3 POD_INSTANTIATED events')

    assert.equal(types[types.length - 1], 'POD_COMPLETED')

    // Chronological order
    for (let i = 1; i < timeline.length; i++) {
      assert.ok(
        new Date(timeline[i].created_at) >= new Date(timeline[i - 1].created_at),
        'events must be chronological'
      )
    }

    // Collect event IDs for evidence
    timeline.forEach(e => eventIds.push(e.id))
  })

  // 7 — All actor_type must be HUMAN, actor_user_id must be null
  it('all events have actor_type HUMAN and actor_user_id null', async () => {
    const timeline = await svc.getProgramTimeline(TENANT, programId)
    for (const e of timeline) {
      assert.equal(e.actor_type, 'HUMAN', `event ${e.event_type} actor_type`)
      assert.equal(e.actor_user_id, null, `event ${e.event_type} actor_user_id should be null`)
    }
  })

  // 8 — Append-only: has_table_privilege UPDATE=false, DELETE=false
  it('sdp_program_events: UPDATE and DELETE privileges are denied', async () => {
    const client = await pool.connect()
    try {
      const upd = await client.query(
        "SELECT has_table_privilege(current_user, 'sdp_program_events', 'UPDATE') AS can_update"
      )
      const del = await client.query(
        "SELECT has_table_privilege(current_user, 'sdp_program_events', 'DELETE') AS can_delete"
      )
      assert.equal(upd.rows[0].can_update, false, 'UPDATE must be denied on sdp_program_events')
      assert.equal(del.rows[0].can_delete, false, 'DELETE must be denied on sdp_program_events')
    } finally {
      client.release()
    }
  })

  // 9 — No shift/attendance/clock columns
  it('no shift/attendance/clock columns in sdp_programs or sdp_pods', async () => {
    const client = await pool.connect()
    try {
      const result = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name IN ('sdp_programs', 'sdp_pods')
          AND (column_name ILIKE '%shift%'
            OR column_name ILIKE '%attendance%'
            OR column_name ILIKE '%clock%')
      `)
      assert.equal(result.rows.length, 0, 'zero shift/attendance/clock columns')
    } finally {
      client.release()
    }
  })

  // 10 — Evidence block
  it('output evidence block', async () => {
    const columnClient = await pool.connect()
    let columnCheckResult
    try {
      const r = await columnClient.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name IN ('sdp_programs', 'sdp_pods')
          AND (column_name ILIKE '%shift%' OR column_name ILIKE '%attendance%' OR column_name ILIKE '%clock%')
      `)
      columnCheckResult = r.rows.length === 0 ? 'PASS (0 rows)' : `FAIL (${r.rows.length} rows)`
    } finally {
      columnClient.release()
    }

    const evidence = {
      program_id: programId,
      pod_ids: podIds,
      event_ids: eventIds,
      actor_types: 'ALL HUMAN',
      actor_user_id: ACTOR_USER_ID,
      column_check: columnCheckResult,
      tenant: TENANT,
      timestamp: new Date().toISOString(),
    }

    console.log('\n========== SDP LIFECYCLE INTEGRATION EVIDENCE ==========')
    console.log(JSON.stringify(evidence, null, 2))
    console.log('=========================================================\n')

    assert.ok(evidence.program_id, 'evidence has program_id')
    assert.equal(Object.keys(evidence.pod_ids).length, 3, 'evidence has 3 pod IDs')
    assert.ok(evidence.event_ids.length >= 7, 'evidence has at least 7 event IDs')
  })
})
