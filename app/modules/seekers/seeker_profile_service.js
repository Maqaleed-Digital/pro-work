'use strict'

const crypto = require('crypto')
const completionConfig = require('../../config/seeker/profile_completion_weights_v1.json')

const ACTIVATION_THRESHOLD = completionConfig.activationThresholdPct
const WEIGHTS = completionConfig.weights

function computeCompletion(profile, skillCount, hasCert) {
  let total = 0
  const w = WEIGHTS

  // Basic identity
  const idFields = ['full_name_en', 'full_name_ar', 'nationality', 'residency_country']
  const idFilled = idFields.filter(f => profile[f] && String(profile[f]).trim()).length
  total += (idFilled / idFields.length) * w.basic_identity.weight

  // Work permit
  if (profile.work_permit_status && profile.work_permit_status !== 'UNKNOWN') total += w.work_permit.weight

  // Persona (always set)
  if (profile.primary_persona) total += w.persona.weight

  // Skills
  if (skillCount >= 3) total += w.skills_min_3.weight

  // Verified credential
  if (hasCert) total += w.verified_credential.weight

  // Timezone + availability
  const tzFields = ['timezone_offset_minutes', 'availability_hours_per_week']
  const tzFilled = tzFields.filter(f => profile[f] != null).length
  total += (tzFilled / tzFields.length) * w.timezone_availability.weight

  // Languages
  const langs = profile.preferred_language_codes
  if (langs && ((Array.isArray(langs) && langs.length > 0) || (typeof langs === 'string' && langs.length > 2))) {
    total += w.languages.weight
  }

  return Math.round(total)
}

function createSeekerProfileService(opts) {
  if (!opts || !opts.pool) throw new Error('pool is required')
  const pool = opts.pool

  async function withUser(userId, fn) {
    const client = await pool.connect()
    try {
      await client.query("SELECT set_config('app.current_user_id', $1, false)", [userId])
      await client.query("SELECT set_config('app.current_tenant_id', '', false)")
      return await fn(client)
    } finally { client.release() }
  }

  async function emitEvent(client, profileId, eventType, actorUserId, actorType, payload) {
    await client.query(
      `INSERT INTO seeker_profile_events (id, seeker_profile_id, event_type, actor_user_id, actor_type, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [crypto.randomUUID(), profileId, eventType, actorUserId || null, actorType || 'HUMAN', JSON.stringify(payload || {})]
    )
  }

  return {
    async createProfile(userId, payload) {
      if (!payload.full_name_en) throw Object.assign(new Error('full_name_en is required'), { status: 422 })
      if (!payload.full_name_ar) throw Object.assign(new Error('full_name_ar is required'), { status: 422 })

      return withUser(userId, async (client) => {
        // Check duplicate
        const existing = await client.query('SELECT id FROM seeker_profiles WHERE user_id = $1', [userId])
        if (existing.rows.length > 0) throw Object.assign(new Error('profile already exists for this user'), { status: 409 })

        const email = payload.email || ''
        const pct = computeCompletion(payload, 0, false)
        const id = crypto.randomUUID()

        const result = await client.query(
          `INSERT INTO seeker_profiles (id, user_id, email, full_name_en, full_name_ar, nationality,
            residency_country, residency_city, work_permit_status, primary_persona,
            availability_hours_per_week, timezone_offset_minutes, preferred_language_codes,
            profile_completion_pct, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'INCOMPLETE',NOW(),NOW()) RETURNING *`,
          [id, userId, email, payload.full_name_en, payload.full_name_ar,
           payload.nationality || null, payload.residency_country || null,
           payload.residency_city || null, payload.work_permit_status || 'UNKNOWN',
           payload.primary_persona || 'FREELANCER',
           payload.availability_hours_per_week || null,
           payload.timezone_offset_minutes || null,
           payload.preferred_language_codes || '{}', pct]
        )

        await emitEvent(client, id, 'PROFILE_CREATED', userId, 'HUMAN', { completion_pct: pct })
        return result.rows[0]
      })
    },

    async getProfile(userId) {
      return withUser(userId, async (client) => {
        const r = await client.query('SELECT * FROM seeker_profiles WHERE user_id = $1', [userId])
        return r.rows[0] || null
      })
    },

    async updateProfile(userId, profileId, patch) {
      // Prevent direct eri_score modification
      if (patch.eri_score !== undefined) {
        throw Object.assign(new Error('eri_score can only be set by the ERI service'), { status: 403 })
      }

      return withUser(userId, async (client) => {
        const r = await client.query('SELECT * FROM seeker_profiles WHERE id = $1 AND user_id = $2', [profileId, userId])
        if (!r.rows[0]) throw Object.assign(new Error('profile not found'), { status: 404 })

        const updatable = ['full_name_en', 'full_name_ar', 'nationality', 'residency_country',
          'residency_city', 'date_of_birth', 'gender', 'work_permit_status', 'primary_persona',
          'availability_hours_per_week', 'timezone_offset_minutes', 'preferred_language_codes']
        const sets = []
        const params = []
        for (const key of updatable) {
          if (patch[key] !== undefined) {
            params.push(key === 'preferred_language_codes' ? (Array.isArray(patch[key]) ? patch[key] : []) : patch[key])
            sets.push(`${key} = $${params.length}`)
          }
        }
        if (sets.length === 0) return r.rows[0]

        // Recompute completion
        const merged = Object.assign({}, r.rows[0], patch)
        const skills = await client.query('SELECT count(*)::int AS cnt FROM seeker_skills WHERE seeker_profile_id = $1', [profileId])
        const certs = await client.query('SELECT count(*)::int AS cnt FROM seeker_certifications WHERE seeker_profile_id = $1 AND verification_status IN ($2,$3)', [profileId, 'VERIFIED', 'PENDING'])
        const pct = computeCompletion(merged, skills.rows[0].cnt, certs.rows[0].cnt > 0)

        params.push(pct)
        sets.push(`profile_completion_pct = $${params.length}`)

        let newStatus = r.rows[0].status
        if (r.rows[0].status === 'INCOMPLETE' && pct >= ACTIVATION_THRESHOLD) {
          newStatus = 'ACTIVE'
          params.push(newStatus)
          sets.push(`status = $${params.length}`)
        }

        sets.push('updated_at = NOW()')
        params.push(profileId)
        await client.query(`UPDATE seeker_profiles SET ${sets.join(', ')} WHERE id = $${params.length}`, params)

        await emitEvent(client, profileId, 'PROFILE_UPDATED', userId, 'HUMAN', { completion_pct: pct })
        if (newStatus !== r.rows[0].status) {
          await emitEvent(client, profileId, 'STATUS_CHANGED', userId, 'HUMAN', { from: r.rows[0].status, to: newStatus })
        }

        return { profileId, profile_completion_pct: pct, status: newStatus }
      })
    },

    async addSkill(userId, profileId, skillPayload) {
      if (!skillPayload.skill_key) throw Object.assign(new Error('skill_key is required'), { status: 422 })

      return withUser(userId, async (client) => {
        const id = crypto.randomUUID()
        const result = await client.query(
          `INSERT INTO seeker_skills (id, seeker_profile_id, skill_key, proficiency, years_of_experience, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING *`,
          [id, profileId, skillPayload.skill_key, skillPayload.proficiency || 'INTERMEDIATE',
           skillPayload.years_of_experience || null]
        )
        await emitEvent(client, profileId, 'SKILL_ADDED', userId, 'HUMAN', { skill_key: skillPayload.skill_key })
        return result.rows[0]
      })
    },

    async removeSkill(userId, profileId, skillId) {
      return withUser(userId, async (client) => {
        await client.query('DELETE FROM seeker_skills WHERE id = $1 AND seeker_profile_id = $2', [skillId, profileId])
        return { removed: true }
      })
    },

    async addCertification(userId, profileId, certPayload) {
      if (!certPayload.cert_name) throw Object.assign(new Error('cert_name is required'), { status: 422 })

      return withUser(userId, async (client) => {
        const id = crypto.randomUUID()
        const result = await client.query(
          `INSERT INTO seeker_certifications (id, seeker_profile_id, cert_name, issuer, issued_date, expires_date, document_ref, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING *`,
          [id, profileId, certPayload.cert_name, certPayload.issuer || null,
           certPayload.issued_date || null, certPayload.expires_date || null,
           certPayload.document_ref || null]
        )
        await emitEvent(client, profileId, 'CERTIFICATION_ADDED', userId, 'HUMAN', { cert_name: certPayload.cert_name })
        return result.rows[0]
      })
    },

    async triggerEriComputation(profileId, eriScore) {
      const client = await pool.connect()
      try {
        await client.query("SELECT set_config('app.current_tenant_id', '', false)")
        await client.query(
          'UPDATE seeker_profiles SET eri_score = $1, eri_last_computed_at = NOW(), updated_at = NOW() WHERE id = $2',
          [eriScore, profileId]
        )
        await emitEvent(client, profileId, 'ERI_COMPUTED', null, 'SYSTEM', { eri_score: eriScore })
        return { profileId, eri_score: eriScore }
      } finally { client.release() }
    },

    async getTimeline(userId, profileId) {
      return withUser(userId, async (client) => {
        return (await client.query('SELECT * FROM seeker_profile_events WHERE seeker_profile_id = $1 ORDER BY created_at ASC', [profileId])).rows
      })
    },

    // Exported for testing
    computeCompletion,
  }
}

module.exports = { createSeekerProfileService }
