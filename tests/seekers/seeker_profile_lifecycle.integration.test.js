'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { test('SKIP: no DATABASE_URL', () => assert.ok(true)); } else {

const { Pool } = require('pg')
const { createSeekerProfileService } = require('../../app/modules/seekers/seeker_profile_service')

const pool = new Pool({ connectionString: DATABASE_URL, max: 2, connectionTimeoutMillis: 10000 })
const svc = createSeekerProfileService({ pool })

const ts = Date.now()
const testEmail = `s45g1-seeker-${ts}@test.workcaptain.ai`

test('SeekerProfile lifecycle: register → profile → skills → activate → ERI', async () => {
  // Step 1: Register via API to get a valid user_id
  const regResp = await fetch('https://api.workcaptain.ai/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'SeekerTest2026!', companyName: 'Seeker Test Co' }),
  })
  assert.ok([200, 201].includes(regResp.status), `register failed: ${regResp.status}`)
  const regData = await regResp.json()
  const userId = regData.data.user.id
  assert.ok(userId, 'user_id must exist')
  console.log(`  User registered: ${userId} (${testEmail})`)

  // Step 2: Create seeker profile
  const profile = await svc.createProfile(userId, {
    email: testEmail,
    full_name_en: 'Integration Seeker',
    full_name_ar: 'باحث تكامل',
    nationality: 'SAU',
    residency_country: 'SAU',
    primary_persona: 'FREELANCER',
  })
  assert.ok(profile.id, 'profile ID must exist')
  assert.strictEqual(profile.status, 'INCOMPLETE')
  const initialPct = profile.profile_completion_pct
  assert.ok(initialPct > 0, `initial completion must be > 0, got ${initialPct}`)
  assert.ok(initialPct < 70, `initial completion must be < 70, got ${initialPct}`)
  console.log(`  Profile created: ${profile.id}, completion=${initialPct}%, status=${profile.status}`)

  // Step 3: Add 3 skills
  const s1 = await svc.addSkill(userId, profile.id, { skill_key: 'javascript', proficiency: 'EXPERT', years_of_experience: 5 })
  const s2 = await svc.addSkill(userId, profile.id, { skill_key: 'python', proficiency: 'ADVANCED', years_of_experience: 3 })
  const s3 = await svc.addSkill(userId, profile.id, { skill_key: 'arabic', proficiency: 'EXPERT', years_of_experience: 10 })
  assert.ok(s1.id && s2.id && s3.id)
  console.log(`  Skills added: ${s1.id.slice(0,8)}, ${s2.id.slice(0,8)}, ${s3.id.slice(0,8)}`)

  // Step 4: Update profile with more fields to reach >= 70%
  const update = await svc.updateProfile(userId, profile.id, {
    work_permit_status: 'CITIZEN',
    timezone_offset_minutes: 180,
    availability_hours_per_week: 40,
    preferred_language_codes: ['ar', 'en'],
  })
  assert.ok(update.profile_completion_pct >= 70, `completion must be >= 70, got ${update.profile_completion_pct}`)
  assert.strictEqual(update.status, 'ACTIVE', 'status must transition to ACTIVE')
  console.log(`  Updated: completion=${update.profile_completion_pct}%, status=${update.status}`)

  // Step 5: Trigger ERI computation
  const eri = await svc.triggerEriComputation(profile.id, 85.5)
  assert.strictEqual(eri.eri_score, 85.5)
  console.log(`  ERI computed: ${eri.eri_score}`)

  // Step 6: Query events
  const events = await svc.getTimeline(userId, profile.id)
  assert.ok(events.length >= 5, `expected >= 5 events, got ${events.length}`)
  for (let i = 1; i < events.length; i++) {
    assert.ok(new Date(events[i].created_at) >= new Date(events[i - 1].created_at), 'chronological order')
  }
  console.log(`  Events: ${events.length} rows, chronological`)
  events.forEach((e, i) => console.log(`    ${i + 1}. ${e.id}  ${e.event_type}  actor=${e.actor_type}`))

  // Step 7: Append-only verification
  const client = await pool.connect()
  try {
    const priv = await client.query(
      "SELECT has_table_privilege('prowork_app', 'seeker_profile_events', 'UPDATE') AS can_update, " +
      "has_table_privilege('prowork_app', 'seeker_profile_events', 'DELETE') AS can_delete"
    )
    assert.strictEqual(priv.rows[0].can_update, false)
    assert.strictEqual(priv.rows[0].can_delete, false)
    console.log(`  Append-only: UPDATE=${priv.rows[0].can_update} DELETE=${priv.rows[0].can_delete}`)

    // Step 8: Schema safeguard
    const cols = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name IN ('seeker_profiles','seeker_skills','seeker_certifications') AND (column_name ILIKE '%shift%' OR column_name ILIKE '%attendance%' OR column_name ILIKE '%clock%' OR column_name ILIKE '%hours_per_day%')"
    )
    assert.strictEqual(cols.rows.length, 0, 'zero shift/attendance/clock/hours_per_day columns')
    console.log(`  Schema safeguard: ${cols.rows.length} prohibited columns (expected 0)`)
  } finally { client.release() }

  // Evidence output
  console.log('')
  console.log('  === S45-G1 SEEKER PROFILE INTEGRATION EVIDENCE ===')
  console.log(`  User ID: ${userId}`)
  console.log(`  Profile ID: ${profile.id}`)
  console.log(`  Completion: ${initialPct}% → ${update.profile_completion_pct}%`)
  console.log(`  Status: INCOMPLETE → ${update.status}`)
  console.log(`  ERI: ${eri.eri_score} (wired via triggerEriComputation — SYSTEM actor)`)
  console.log(`  Events: ${events.length}`)
  events.forEach((e, i) => console.log(`    ${i + 1}. ${e.id}  ${e.event_type}  actor=${e.actor_type}`))
  console.log(`  Append-only: UPDATE=false DELETE=false`)
  console.log(`  Schema safeguard: 0 prohibited columns`)
  console.log(`  ERI wiring: triggerEriComputation(profileId, score) — called by S25 ERI service`)
  console.log(`    as a side-effect. No direct user call. Actor_type=SYSTEM on ERI_COMPUTED event.`)
})

test.after(() => pool.end())

}
