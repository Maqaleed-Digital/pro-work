'use strict'

/**
 * S43-G3 Integration Test: end-to-end candidate pipeline
 * against live Cloud SQL.
 *
 * Runs via: DATABASE_URL env var (set by Cloud Run Job or local proxy)
 * Seed requisition: 1da8dc6c-1e7d-404b-bef0-396163518c59 (from G2 smoke test)
 */

const test   = require('node:test')
const assert = require('node:assert/strict')

const SEED_REQ_ID = '1da8dc6c-1e7d-404b-bef0-396163518c59'

// Skip if no DATABASE_URL (can't reach Cloud SQL)
const DB_URL = process.env.DATABASE_URL
if (!DB_URL) {
  test('SKIP: DATABASE_URL not set — run via Cloud Run Job or with Cloud SQL proxy', () => {
    assert.ok(true, 'skipped — no DB access')
  })
} else {

const { Pool } = require('pg')
const { createCandidateService }   = require('../../app/modules/hiring/candidate_service')
const { createApplicationService } = require('../../app/modules/hiring/application_service')

const pool = new Pool({ connectionString: DB_URL, max: 2, connectionTimeoutMillis: 10000 })

test('end-to-end: candidate applies to published requisition and walks full pipeline to HIRED', async () => {
  const ts = Date.now()
  const testEmail = `s43g3-e2e-${ts}@test.workcaptain.ai`
  const candidateSvc = createCandidateService({ pool })
  const applicationSvc = createApplicationService({ pool })

  // ── Step 1: Find the seed requisition ─────────────────────────────────
  const client = await pool.connect()
  try {
    const reqResult = await client.query(
      'SELECT id, tenant_id, status FROM requisitions WHERE id = $1',
      [SEED_REQ_ID]
    )
    assert.ok(reqResult.rows.length > 0,
      `Seed requisition ${SEED_REQ_ID} not found in Cloud SQL. ` +
      'G2 smoke test row must exist — do not silently substitute.')
    const seedReq = reqResult.rows[0]

    // If not PUBLISHED, publish it now (DRAFT → NITAQAT_PREVIEWED → PUBLISHED)
    if (seedReq.status !== 'PUBLISHED') {
      console.log(`  Seed requisition status is ${seedReq.status}, publishing...`)
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [seedReq.tenant_id])
      if (seedReq.status === 'DRAFT') {
        await client.query(
          "UPDATE requisitions SET status = 'NITAQAT_PREVIEWED', nitaqat_preview_run_at = NOW(), nitaqat_preview_result = $1, updated_at = NOW() WHERE id = $2",
          [JSON.stringify({ currentZone: 'HIGH_GREEN', projectedZone: 'HIGH_GREEN' }), SEED_REQ_ID]
        )
      }
      await client.query(
        "UPDATE requisitions SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW() WHERE id = $1",
        [SEED_REQ_ID]
      )
    }

    // Re-read and assert PUBLISHED
    const pubCheck = await client.query('SELECT status FROM requisitions WHERE id = $1', [SEED_REQ_ID])
    assert.strictEqual(pubCheck.rows[0].status, 'PUBLISHED', 'seed requisition must be PUBLISHED')
    console.log(`  Step 1: Seed requisition ${SEED_REQ_ID} confirmed PUBLISHED`)

    const tenantId = seedReq.tenant_id

    // ── Step 2: Create test candidate ─────────────────────────────────────
    const candidate = await candidateSvc.createCandidate(tenantId, {
      first_name: 'Integration',
      last_name: 'TestCandidate',
      email: testEmail,
      nationality: 'SAU',
      source: 'DIRECT',
    })
    assert.ok(candidate.id, 'candidate should be created')
    assert.strictEqual(candidate.email, testEmail)
    console.log(`  Step 2: Candidate created: ${candidate.id} (${testEmail})`)

    // ── Step 3: Create application ────────────────────────────────────────
    const app = await applicationSvc.createApplication(
      tenantId, candidate.id, SEED_REQ_ID, 'DIRECT', null
    )
    assert.ok(app.id, 'application should be created')
    assert.strictEqual(app.status, 'APPLIED')
    console.log(`  Step 3: Application created: ${app.id}, status=APPLIED`)

    // Verify initial event
    const initialEvents = await applicationSvc.getApplicationTimeline(tenantId, app.id)
    assert.strictEqual(initialEvents.length, 1, 'should have exactly 1 event after creation')
    assert.strictEqual(initialEvents[0].event_type, 'STATUS_CHANGED')
    assert.strictEqual(initialEvents[0].previous_status, null)
    assert.strictEqual(initialEvents[0].new_status, 'APPLIED')
    assert.strictEqual(initialEvents[0].actor_type, 'HUMAN')
    console.log(`  Step 3: STATUS_CHANGED event verified: null → APPLIED, actor_type=HUMAN`)

    // ── Step 4: Walk the full pipeline ────────────────────────────────────
    const transitions = [
      { to: 'SCREENING',   from: 'APPLIED' },
      { to: 'SHORTLISTED', from: 'SCREENING' },
      { to: 'INTERVIEWED', from: 'SHORTLISTED' },
      { to: 'OFFERED',     from: 'INTERVIEWED' },
      { to: 'HIRED',       from: 'OFFERED' },
    ]

    for (const tr of transitions) {
      const result = await applicationSvc.transitionStatus(tenantId, app.id, tr.to, null)
      assert.strictEqual(result.previousStatus, tr.from)
      assert.strictEqual(result.newStatus, tr.to)

      // Verify event was appended
      const evts = await applicationSvc.getApplicationTimeline(tenantId, app.id)
      const latest = evts[evts.length - 1]
      assert.strictEqual(latest.new_status, tr.to)
      assert.strictEqual(latest.previous_status, tr.from)
      console.log(`  Step 4: ${tr.from} → ${tr.to} ✓ (event ${latest.id})`)
    }

    // ── Step 5: Verify complete timeline ──────────────────────────────────
    const fullTimeline = await applicationSvc.getApplicationTimeline(tenantId, app.id)
    assert.strictEqual(fullTimeline.length, 6,
      `expected 6 events, got ${fullTimeline.length}`)

    // Verify chronological order
    for (let i = 1; i < fullTimeline.length; i++) {
      assert.ok(
        new Date(fullTimeline[i].created_at) >= new Date(fullTimeline[i - 1].created_at),
        'events must be in chronological order'
      )
    }
    console.log(`  Step 5: Timeline verified — 6 events in chronological order`)

    // ── Step 6: Verify append-only on application_events ──────────────────
    const privCheck = await client.query(
      "SELECT has_table_privilege('prowork_app', 'application_events', 'UPDATE') AS can_update, " +
      "has_table_privilege('prowork_app', 'application_events', 'DELETE') AS can_delete"
    )
    assert.strictEqual(privCheck.rows[0].can_update, false, 'UPDATE must be blocked on application_events')
    assert.strictEqual(privCheck.rows[0].can_delete, false, 'DELETE must be blocked on application_events')
    console.log(`  Step 6: Append-only verified — UPDATE=false, DELETE=false`)

    // ── Output evidence ───────────────────────────────────────────────────
    console.log(`\n  === S43-G3 INTEGRATION EVIDENCE ===`)
    console.log(`  Application ID: ${app.id}`)
    console.log(`  Candidate ID:   ${candidate.id}`)
    console.log(`  Tenant ID:      ${tenantId}`)
    console.log(`  Requisition ID: ${SEED_REQ_ID}`)
    console.log(`  Event IDs:`)
    fullTimeline.forEach((e, i) => {
      console.log(`    ${i + 1}. ${e.id}  ${e.previous_status || 'null'} → ${e.new_status}`)
    })
    console.log(`  Candidate email: ${testEmail} (append-only, no cleanup)`)

  } finally {
    client.release()
  }
})

test.after(() => pool.end())

} // end DB_URL check
