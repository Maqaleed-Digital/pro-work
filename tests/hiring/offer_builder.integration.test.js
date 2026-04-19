'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) { test('SKIP: no DATABASE_URL', () => assert.ok(true)); } else {

const { Pool } = require('pg')
const { createOfferService } = require('../../app/modules/hiring/offer_service')
const { createApplicationService } = require('../../app/modules/hiring/application_service')

const pool = new Pool({ connectionString: DB_URL, max: 2, connectionTimeoutMillis: 10000 })
const offerSvc = createOfferService({ pool })
const appSvc = createApplicationService({ pool })

const APP_G4 = '016e6d82-2098-47bd-8bc9-afc56845ee97'
const TENANT = 'tn-e04ac090'

test('integration: create FTE offer for G4 application, compliance preview, send', async () => {
  const client = await pool.connect()
  try {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT])

    // Check application status
    const appRow = await client.query('SELECT status FROM applications WHERE id = $1', [APP_G4])
    assert.ok(appRow.rows[0], 'G4 application must exist')
    const currentStatus = appRow.rows[0].status
    console.log(`  G4 application current status: ${currentStatus}`)

    // Transition to SHORTLISTED if needed for offer eligibility
    if (currentStatus === 'APPLIED') {
      await appSvc.transitionStatus(TENANT, APP_G4, 'SCREENING', null)
      await appSvc.transitionStatus(TENANT, APP_G4, 'SHORTLISTED', null)
      console.log('  Transitioned: APPLIED → SCREENING → SHORTLISTED')
    } else if (currentStatus === 'SCREENING') {
      await appSvc.transitionStatus(TENANT, APP_G4, 'SHORTLISTED', null)
      console.log('  Transitioned: SCREENING → SHORTLISTED')
    }

    // Create FTE offer
    const offer = await offerSvc.createOffer(TENANT, APP_G4, 'FTE', {
      base_salary: 15000, probation_days: 90, notice_period_days: 30,
    })
    assert.ok(offer.id)
    assert.strictEqual(offer.status, 'DRAFT')
    console.log(`  Offer created: ${offer.id} type=${offer.offer_type} status=${offer.status}`)

    // Run compliance preview
    const preview = await offerSvc.runCompliancePreview(TENANT, offer.id)
    console.log(`  Compliance preview:`)
    Object.entries(preview.checks).forEach(([k, v]) => {
      console.log(`    ${k}: ${v.status} — ${v.message}`)
    })
    console.log(`  all_green=${preview.all_green} has_red=${preview.has_red}`)

    // Send offer (with override if RED)
    const overrideReason = preview.has_red ? 'Integration test override' : null
    const sendResult = await offerSvc.sendOffer(TENANT, offer.id, overrideReason, null)
    assert.strictEqual(sendResult.status, 'SENT')
    console.log(`  Offer sent: status=${sendResult.status}`)

    // Verify application status = OFFERED
    const appAfter = await client.query('SELECT status FROM applications WHERE id = $1', [APP_G4])
    assert.strictEqual(appAfter.rows[0].status, 'OFFERED')
    console.log(`  Application status: ${appAfter.rows[0].status}`)

    // Verify offers row
    const offerRow = await client.query('SELECT id, status, offer_type, compliance_overridden FROM offers WHERE id = $1', [offer.id])
    assert.ok(offerRow.rows[0])
    console.log(`  Offer row: id=${offerRow.rows[0].id} status=${offerRow.rows[0].status} overridden=${offerRow.rows[0].compliance_overridden}`)

    // Verify OFFER_SENT event
    const events = await client.query(
      "SELECT id, event_type, new_status, actor_type FROM application_events WHERE application_id = $1 AND event_type = 'OFFER_SENT' ORDER BY created_at DESC LIMIT 1",
      [APP_G4]
    )
    assert.ok(events.rows[0], 'OFFER_SENT event must exist')
    assert.strictEqual(events.rows[0].actor_type, 'HUMAN')
    console.log(`  OFFER_SENT event: id=${events.rows[0].id} actor_type=${events.rows[0].actor_type}`)

    // Verify DELETE blocked
    const deleteCheck = await client.query(
      "SELECT has_table_privilege('prowork_app', 'offers', 'DELETE') AS can_delete"
    )
    assert.strictEqual(deleteCheck.rows[0].can_delete, false)
    console.log(`  DELETE blocked: can_delete=${deleteCheck.rows[0].can_delete}`)

    // Evidence output
    console.log('')
    console.log('  === S43-G6 INTEGRATION EVIDENCE ===')
    console.log(`  Offer ID: ${offer.id}`)
    console.log(`  Application: ${APP_G4} status=OFFERED`)
    console.log(`  OFFER_SENT event ID: ${events.rows[0].id}`)
    console.log(`  has_table_privilege DELETE: false`)
    console.log(`  0% commission badge EN: ${require('../../app/frontend/src/locales/en.json')['offer.commissionBadge']}`)
    console.log(`  0% commission badge AR: ${require('../../app/frontend/src/locales/ar.json')['offer.commissionBadge']}`)

  } finally {
    client.release()
  }
})

test.after(() => pool.end())

}
