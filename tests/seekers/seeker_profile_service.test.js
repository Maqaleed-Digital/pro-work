'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const { createSeekerProfileService } = require('../../app/modules/seekers/seeker_profile_service')
const rbac = require('../../app/modules/auth/rbac_policy')
const completionConfig = require('../../app/config/seeker/profile_completion_weights_v1.json')

// ---------------------------------------------------------------------------
// Mock pool
// ---------------------------------------------------------------------------
function createMockPool() {
  const tables = {
    seeker_profiles: new Map(),
    seeker_skills: new Map(),
    seeker_certifications: new Map(),
    seeker_profile_events: new Map(),
  }
  let lastSetConfig = null

  function makeClient() {
    return {
      query(sql, params) {
        // Capture set_config calls
        if (sql.includes('set_config')) {
          if (sql.includes('app.current_user_id')) {
            lastSetConfig = params ? params[0] : null
          }
          return { rows: [{ set_config: '' }] }
        }

        // SELECT id FROM seeker_profiles WHERE user_id = $1
        if (/SELECT id FROM seeker_profiles WHERE user_id/i.test(sql)) {
          const userId = params[0]
          const rows = []
          for (const p of tables.seeker_profiles.values()) {
            if (p.user_id === userId) rows.push({ id: p.id })
          }
          return { rows }
        }

        // SELECT * FROM seeker_profiles WHERE id = $1 AND user_id = $2
        if (/SELECT \* FROM seeker_profiles WHERE id.*AND user_id/i.test(sql)) {
          const id = params[0]; const userId = params[1]
          const p = tables.seeker_profiles.get(id)
          return { rows: (p && p.user_id === userId) ? [p] : [] }
        }

        // SELECT * FROM seeker_profiles WHERE user_id
        if (/SELECT \* FROM seeker_profiles WHERE user_id/i.test(sql)) {
          const userId = params[0]
          const rows = []
          for (const p of tables.seeker_profiles.values()) {
            if (p.user_id === userId) rows.push(p)
          }
          return { rows }
        }

        // INSERT INTO seeker_profiles
        if (/INSERT INTO seeker_profiles/i.test(sql)) {
          const row = {
            id: params[0], user_id: params[1], email: params[2],
            full_name_en: params[3], full_name_ar: params[4],
            nationality: params[5], residency_country: params[6],
            residency_city: params[7], work_permit_status: params[8],
            primary_persona: params[9],
            availability_hours_per_week: params[10],
            timezone_offset_minutes: params[11],
            preferred_language_codes: params[12],
            profile_completion_pct: params[13],
            status: 'INCOMPLETE',
            created_at: new Date(), updated_at: new Date(),
          }
          tables.seeker_profiles.set(row.id, row)
          return { rows: [row] }
        }

        // INSERT INTO seeker_profile_events
        if (/INSERT INTO seeker_profile_events/i.test(sql)) {
          const row = {
            id: params[0], seeker_profile_id: params[1],
            event_type: params[2], actor_user_id: params[3],
            actor_type: params[4], payload: params[5],
            created_at: new Date(),
          }
          tables.seeker_profile_events.set(row.id, row)
          return { rows: [row] }
        }

        // INSERT INTO seeker_skills
        if (/INSERT INTO seeker_skills/i.test(sql)) {
          const row = {
            id: params[0], seeker_profile_id: params[1],
            skill_key: params[2], proficiency: params[3],
            years_of_experience: params[4],
            created_at: new Date(), updated_at: new Date(),
          }
          tables.seeker_skills.set(row.id, row)
          return { rows: [row] }
        }

        // DELETE FROM seeker_skills
        if (/DELETE FROM seeker_skills/i.test(sql)) {
          const id = params[0]
          tables.seeker_skills.delete(id)
          return { rows: [] }
        }

        // INSERT INTO seeker_certifications
        if (/INSERT INTO seeker_certifications/i.test(sql)) {
          const row = {
            id: params[0], seeker_profile_id: params[1],
            cert_name: params[2], issuer: params[3],
            issued_date: params[4], expires_date: params[5],
            document_ref: params[6],
            verification_status: 'UNVERIFIED',
            created_at: new Date(), updated_at: new Date(),
          }
          tables.seeker_certifications.set(row.id, row)
          return { rows: [row] }
        }

        // SELECT count(*)::int AS cnt FROM seeker_skills
        if (/SELECT count.*FROM seeker_skills/i.test(sql)) {
          const profileId = params[0]
          let cnt = 0
          for (const s of tables.seeker_skills.values()) {
            if (s.seeker_profile_id === profileId) cnt++
          }
          return { rows: [{ cnt }] }
        }

        // SELECT count(*)::int AS cnt FROM seeker_certifications
        if (/SELECT count.*FROM seeker_certifications/i.test(sql)) {
          const profileId = params[0]
          let cnt = 0
          for (const c of tables.seeker_certifications.values()) {
            if (c.seeker_profile_id === profileId) cnt++
          }
          return { rows: [{ cnt }] }
        }

        // UPDATE seeker_profiles SET eri_score
        if (/UPDATE seeker_profiles SET eri_score/i.test(sql)) {
          const eriScore = params[0]
          const id = params[1]
          const p = tables.seeker_profiles.get(id)
          if (p) { p.eri_score = eriScore; p.eri_last_computed_at = new Date() }
          return { rows: [] }
        }

        // UPDATE seeker_profiles SET (generic)
        if (/UPDATE seeker_profiles SET/i.test(sql)) {
          const profileId = params[params.length - 1]
          const p = tables.seeker_profiles.get(profileId)
          if (p) {
            // Extract completion_pct and status from sets
            const pctMatch = sql.match(/profile_completion_pct\s*=\s*\$(\d+)/)
            if (pctMatch) p.profile_completion_pct = params[parseInt(pctMatch[1]) - 1]
            const statusMatch = sql.match(/status\s*=\s*\$(\d+)/)
            if (statusMatch) p.status = params[parseInt(statusMatch[1]) - 1]
            p.updated_at = new Date()
          }
          return { rows: [] }
        }

        // SELECT * FROM seeker_profile_events ... ORDER BY created_at
        if (/SELECT \* FROM seeker_profile_events/i.test(sql)) {
          const profileId = params[0]
          const rows = []
          for (const e of tables.seeker_profile_events.values()) {
            if (e.seeker_profile_id === profileId) rows.push(e)
          }
          rows.sort((a, b) => a.created_at - b.created_at)
          return { rows }
        }

        // has_table_privilege
        if (/has_table_privilege/i.test(sql)) {
          return { rows: [{ has_privilege: false }] }
        }

        return { rows: [] }
      },
      release() {},
    }
  }

  return {
    pool: {
      connect() { return Promise.resolve(makeClient()) },
    },
    tables,
    getLastSetConfig() { return lastSetConfig },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('SeekerProfileService – unit tests', () => {
  let svc, mock

  beforeEach(() => {
    mock = createMockPool()
    svc = createSeekerProfileService({ pool: mock.pool })
  })

  // --- Constructor ---
  it('rejects missing pool', () => {
    assert.throws(() => createSeekerProfileService({}), /pool is required/)
  })

  it('rejects undefined opts', () => {
    assert.throws(() => createSeekerProfileService(), /pool is required/)
  })

  // --- createProfile ---
  it('createProfile happy path', async () => {
    const result = await svc.createProfile('user-1', {
      full_name_en: 'Ali', full_name_ar: 'علي',
      nationality: 'SAU', residency_country: 'SAU',
    })
    assert.ok(result.id, 'profile id exists')
    assert.equal(result.user_id, 'user-1')
    assert.equal(result.full_name_en, 'Ali')
    assert.equal(result.status, 'INCOMPLETE')
    assert.ok(result.profile_completion_pct > 0, 'completion > 0')
  })

  it('createProfile rejects duplicate (409)', async () => {
    await svc.createProfile('user-1', { full_name_en: 'Ali', full_name_ar: 'علي' })
    await assert.rejects(
      () => svc.createProfile('user-1', { full_name_en: 'Ali', full_name_ar: 'علي' }),
      err => err.status === 409
    )
  })

  it('createProfile requires full_name_en (422)', async () => {
    await assert.rejects(
      () => svc.createProfile('user-1', { full_name_ar: 'علي' }),
      err => err.status === 422 && /full_name_en/.test(err.message)
    )
  })

  it('createProfile requires full_name_ar (422)', async () => {
    await assert.rejects(
      () => svc.createProfile('user-1', { full_name_en: 'Ali' }),
      err => err.status === 422 && /full_name_ar/.test(err.message)
    )
  })

  // --- updateProfile ---
  it('updateProfile recomputes completion_pct', async () => {
    const p = await svc.createProfile('u2', { full_name_en: 'X', full_name_ar: 'ع' })
    const r = await svc.updateProfile('u2', p.id, { nationality: 'SAU', residency_country: 'SAU' })
    assert.ok(r.profile_completion_pct >= p.profile_completion_pct)
  })

  it('updateProfile transitions INCOMPLETE → ACTIVE at 70%', async () => {
    const p = await svc.createProfile('u3', {
      full_name_en: 'X', full_name_ar: 'ع',
      nationality: 'SAU', residency_country: 'SAU',
    })
    // Add 3 skills to reach threshold
    await svc.addSkill('u3', p.id, { skill_key: 'javascript' })
    await svc.addSkill('u3', p.id, { skill_key: 'python' })
    await svc.addSkill('u3', p.id, { skill_key: 'arabic' })

    const r = await svc.updateProfile('u3', p.id, {
      work_permit_status: 'VALID',
      timezone_offset_minutes: 180,
      availability_hours_per_week: 40,
      preferred_language_codes: ['ar', 'en'],
    })
    assert.ok(r.profile_completion_pct >= 70, `completion ${r.profile_completion_pct} should be >= 70`)
    assert.equal(r.status, 'ACTIVE')
  })

  it('updateProfile cannot modify eri_score directly (403)', async () => {
    const p = await svc.createProfile('u4', { full_name_en: 'X', full_name_ar: 'ع' })
    await assert.rejects(
      () => svc.updateProfile('u4', p.id, { eri_score: 99 }),
      err => err.status === 403
    )
  })

  // --- addSkill ---
  it('addSkill happy path', async () => {
    const p = await svc.createProfile('u5', { full_name_en: 'X', full_name_ar: 'ع' })
    const skill = await svc.addSkill('u5', p.id, { skill_key: 'python', proficiency: 'EXPERT' })
    assert.equal(skill.skill_key, 'python')
    assert.equal(skill.proficiency, 'EXPERT')
  })

  it('addSkill rejects missing skill_key (422)', async () => {
    const p = await svc.createProfile('u6', { full_name_en: 'X', full_name_ar: 'ع' })
    await assert.rejects(
      () => svc.addSkill('u6', p.id, { proficiency: 'EXPERT' }),
      err => err.status === 422 && /skill_key/.test(err.message)
    )
  })

  it('addSkill defaults proficiency to INTERMEDIATE', async () => {
    const p = await svc.createProfile('u7', { full_name_en: 'X', full_name_ar: 'ع' })
    const skill = await svc.addSkill('u7', p.id, { skill_key: 'react' })
    assert.equal(skill.proficiency, 'INTERMEDIATE')
  })

  // --- removeSkill ---
  it('removeSkill works', async () => {
    const p = await svc.createProfile('u8', { full_name_en: 'X', full_name_ar: 'ع' })
    const skill = await svc.addSkill('u8', p.id, { skill_key: 'go' })
    const r = await svc.removeSkill('u8', p.id, skill.id)
    assert.equal(r.removed, true)
    assert.ok(!mock.tables.seeker_skills.has(skill.id))
  })

  // --- addCertification ---
  it('addCertification happy path', async () => {
    const p = await svc.createProfile('u9', { full_name_en: 'X', full_name_ar: 'ع' })
    const cert = await svc.addCertification('u9', p.id, {
      cert_name: 'AWS SA', issuer: 'AWS',
    })
    assert.equal(cert.cert_name, 'AWS SA')
    assert.ok(cert.id)
  })

  it('addCertification verification_status defaults UNVERIFIED', async () => {
    const p = await svc.createProfile('u10', { full_name_en: 'X', full_name_ar: 'ع' })
    const cert = await svc.addCertification('u10', p.id, { cert_name: 'PMP' })
    assert.equal(cert.verification_status, 'UNVERIFIED')
  })

  // --- triggerEriComputation ---
  it('triggerEriComputation writes eri_score with SYSTEM actor', async () => {
    const p = await svc.createProfile('u11', { full_name_en: 'X', full_name_ar: 'ع' })
    const r = await svc.triggerEriComputation(p.id, 85.5)
    assert.equal(r.eri_score, 85.5)

    // Verify stored value
    const stored = mock.tables.seeker_profiles.get(p.id)
    assert.equal(stored.eri_score, 85.5)
  })

  it('triggerEriComputation emits ERI_COMPUTED event', async () => {
    const p = await svc.createProfile('u12', { full_name_en: 'X', full_name_ar: 'ع' })
    await svc.triggerEriComputation(p.id, 90)

    const events = [...mock.tables.seeker_profile_events.values()]
      .filter(e => e.seeker_profile_id === p.id && e.event_type === 'ERI_COMPUTED')
    assert.equal(events.length, 1)
    assert.equal(events[0].actor_type, 'SYSTEM')
    assert.equal(events[0].actor_user_id, null)
  })

  // --- Events append-only (no UPDATE/DELETE SQL on seeker_profile_events) ---
  it('source code has no UPDATE or DELETE on seeker_profile_events', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../app/modules/seekers/seeker_profile_service.js'), 'utf8'
    )
    // Only INSERT should reference seeker_profile_events
    const lines = src.split('\n')
    for (const line of lines) {
      if (/seeker_profile_events/i.test(line)) {
        assert.ok(
          !/\b(UPDATE|DELETE)\b/i.test(line.replace(/INSERT/g, '')),
          `append-only violated: ${line.trim()}`
        )
      }
    }
  })

  // --- Actor discipline ---
  it('HUMAN actor for user-initiated actions', async () => {
    const p = await svc.createProfile('u13', { full_name_en: 'X', full_name_ar: 'ع' })
    const events = [...mock.tables.seeker_profile_events.values()]
      .filter(e => e.seeker_profile_id === p.id)
    assert.ok(events.length > 0)
    for (const e of events) {
      assert.equal(e.actor_type, 'HUMAN')
    }
  })

  it('SYSTEM actor for ERI computation', async () => {
    const p = await svc.createProfile('u14', { full_name_en: 'X', full_name_ar: 'ع' })
    await svc.triggerEriComputation(p.id, 77)
    const eriEvents = [...mock.tables.seeker_profile_events.values()]
      .filter(e => e.event_type === 'ERI_COMPUTED')
    assert.ok(eriEvents.length > 0)
    for (const e of eriEvents) {
      assert.equal(e.actor_type, 'SYSTEM')
    }
  })

  // --- RLS set_config ---
  it('RLS set_config called with user_id', async () => {
    await svc.createProfile('rls-user', { full_name_en: 'X', full_name_ar: 'ع' })
    assert.equal(mock.getLastSetConfig(), 'rls-user')
  })

  // --- computeCompletion ---
  it('computeCompletion with all fields returns ~95%', () => {
    // bio_summary weight (5) is a placeholder so max without bio = 95
    const profile = {
      full_name_en: 'Ali', full_name_ar: 'علي',
      nationality: 'SAU', residency_country: 'SAU',
      work_permit_status: 'VALID',
      primary_persona: 'FREELANCER',
      timezone_offset_minutes: 180,
      availability_hours_per_week: 40,
      preferred_language_codes: ['ar', 'en'],
    }
    const pct = svc.computeCompletion(profile, 3, true)
    assert.ok(pct >= 90, `expected ~95, got ${pct}`)
    assert.ok(pct <= 100, `expected <= 100, got ${pct}`)
  })

  it('computeCompletion with minimal fields returns ~30%', () => {
    const profile = {
      full_name_en: 'Ali', full_name_ar: 'علي',
      primary_persona: 'FREELANCER',
    }
    const pct = svc.computeCompletion(profile, 0, false)
    // basic_identity: 2/4 * 25 = ~12, persona: 5 → ~17-18
    assert.ok(pct >= 10, `expected ~17, got ${pct}`)
    assert.ok(pct < 50, `expected < 50, got ${pct}`)
  })

  // --- RBAC policy assertions ---
  it('SEEKER role exists in rbac_policy', () => {
    const roles = rbac.getRoles()
    assert.ok(roles.includes('SEEKER'), `SEEKER role missing, got: ${roles}`)
  })

  it('SEEKER role has SEEKER_OWN_PROFILE permission', () => {
    assert.ok(rbac.hasPermission('SEEKER', 'SEEKER_OWN_PROFILE'))
  })

  it('SEEKER_OWN_PROFILE permission defined in PERMISSIONS', () => {
    assert.equal(rbac.PERMISSIONS.SEEKER_OWN_PROFILE, 'SEEKER_OWN_PROFILE')
  })

  // --- Non-employment safeguard ---
  it('source code has no shift/attendance/clock/hours_per_day fields', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../app/modules/seekers/seeker_profile_service.js'), 'utf8'
    )
    const forbidden = ['shift', 'attendance', 'clock_in', 'clock_out', 'hours_per_day']
    for (const term of forbidden) {
      assert.ok(
        !src.includes(term),
        `Non-employment safeguard violated: source contains "${term}"`
      )
    }
  })

  // --- activation threshold from config ---
  it('activationThresholdPct is 70 in config', () => {
    assert.equal(completionConfig.activationThresholdPct, 70)
  })

  // --- getTimeline returns events in order ---
  it('getTimeline returns chronological events', async () => {
    const p = await svc.createProfile('u-tl', { full_name_en: 'X', full_name_ar: 'ع' })
    await svc.addSkill('u-tl', p.id, { skill_key: 'js' })
    const timeline = await svc.getTimeline('u-tl', p.id)
    assert.ok(timeline.length >= 2)
    for (let i = 1; i < timeline.length; i++) {
      assert.ok(timeline[i].created_at >= timeline[i - 1].created_at)
    }
  })
})
