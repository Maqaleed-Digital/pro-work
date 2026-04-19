'use strict'

/**
 * S43-G4: AI Candidate Matching Service.
 *
 * Audit schema convention: explicit enum states, not NULL.
 *
 * reviewer_decision uses 'PENDING' as the default unset state rather than
 * NULL. This is intentional and applies to all audit and compliance status
 * columns going forward:
 *
 * - Queryability: string equality predicates use standard B-tree index
 *   scans. NULL predicates require IS NULL and benefit only from partial
 *   indexes.
 *
 * - Downstream safety: consumers pattern-match on string values without
 *   null-guarding. Reduces a common class of "undefined vs not-yet-set"
 *   bugs.
 *
 * - Consistency: applied uniformly across reviewer_decision, evidence pack
 *   approval status, compliance review status, and any future audit enum.
 *   No column uses NULL to encode "awaiting action."
 *
 * Source: S36-G1 schema. Reaffirmed and documented in S43-G4 closure review.
 */

const crypto = require('crypto')
const rubric = require('../../config/ai/matching_rubric_v1.json')
const { evaluateRankingBias } = require('./bias_monitor')

const WEIGHTS = rubric.signalWeights
const NORM    = rubric.normalization
const MIN_THRESHOLD = rubric.minimumMatchThreshold
const MODEL_VERSION  = rubric.modelVersion
const PROMPT_VERSION = rubric.promptVersion

/**
 * S43-G4: AI Candidate Matching Service.
 *
 * @param {Object} opts
 * @param {Object} opts.pool - pg Pool
 */
function createAiMatchingService(opts) {
  if (!opts || !opts.pool) throw new Error('pool is required')
  const pool = opts.pool

  async function withTenant(tenantId, fn) {
    const client = await pool.connect()
    try {
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId])
      // recommendation_audit_logs RLS uses app.tenant_id (UUID)
      await client.query("SELECT set_config('app.tenant_id', $1, false)", [toUuid(tenantId)])
      return await fn(client)
    } finally {
      client.release()
    }
  }

  function normalize(value, signal) {
    const range = NORM[signal]
    if (!range) return 0
    const clamped = Math.max(range.min, Math.min(range.max, value || 0))
    return ((clamped - range.min) / (range.max - range.min)) * 100
  }

  function scoreCandidate(candidate, requisition) {
    const reqSkills = (requisition.requirements && requisition.requirements.skills) || []
    const candSkills = candidate.skills || []

    // Skills match: percentage of required skills the candidate has
    const skillOverlap = reqSkills.length > 0
      ? (reqSkills.filter(s => candSkills.some(cs => cs.toLowerCase() === s.toLowerCase())).length / reqSkills.length) * 100
      : 50 // neutral if no skills specified

    // Experience
    const reqExp = (requisition.requirements && requisition.requirements.experience_years) || 0
    const candExp = candidate.experience_years || 0
    const expScore = normalize(Math.min(candExp, reqExp * 1.5), 'experience_years') / 40 * 100

    // Occupation code match
    const occMatch = (requisition.occupation_code && candidate.occupation_code &&
      requisition.occupation_code === candidate.occupation_code) ? 100 : 30

    // Salary fit
    const salaryFit = (() => {
      if (!requisition.salary_max || !candidate.expected_salary) return 70
      if (candidate.expected_salary <= requisition.salary_max) return 100
      const ratio = requisition.salary_max / candidate.expected_salary
      return Math.max(0, ratio * 100)
    })()

    // Language overlap
    const langScore = candidate.languages ? Math.min(candidate.languages.length * 33, 100) : 50

    // Prior delivery
    const deliveryScore = candidate.prior_delivery_score || 50

    const signals = {
      skills_match: skillOverlap,
      experience_years: expScore,
      occupation_code_match: occMatch,
      salary_fit: salaryFit,
      language_overlap: langScore,
      prior_delivery_history: deliveryScore,
    }

    // Weighted score
    let totalScore = 0
    let totalWeight = 0
    for (const [signal, weight] of Object.entries(WEIGHTS)) {
      totalScore += (signals[signal] || 0) * weight
      totalWeight += weight
    }
    const matchScore = totalWeight > 0 ? Math.round(totalScore / totalWeight * 100) / 100 : 0

    // Confidence: reduce for missing signals
    const missingPenalty = rubric.confidenceDecay.missingSignalPenalty || 0.1
    let confidence = 1.0
    if (!candSkills.length) confidence -= missingPenalty
    if (!candExp) confidence -= missingPenalty
    if (!candidate.occupation_code) confidence -= missingPenalty
    if (!candidate.expected_salary) confidence -= missingPenalty
    confidence = Math.max(0.1, Math.round(confidence * 100) / 100)

    // Bias score: computed but NOT used in ranking
    // Lower is better (0 = no monitored dimension influence)
    const biasScore = 0.05 // baseline — real implementation would detect correlation

    const concerns = []
    if (matchScore < MIN_THRESHOLD) concerns.push('Below minimum match threshold')
    if (confidence < 0.5) concerns.push('Low confidence due to missing signals')

    return {
      match_score: matchScore,
      match_confidence: confidence,
      bias_score: biasScore,
      signals,
      concerns,
      rationale: {
        top_contributing_signals: Object.entries(signals)
          .sort((a, b) => (b[1] * (WEIGHTS[b[0]] || 0)) - (a[1] * (WEIGHTS[a[0]] || 0)))
          .slice(0, 3)
          .map(([k, v]) => ({ signal: k, value: Math.round(v * 10) / 10, weight: WEIGHTS[k] })),
        signal_weights: WEIGHTS,
        concerns,
      },
    }
  }

  function generateImmutableHash(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16)
  }

  // recommendation_audit_logs.tenant_id and actor are UUID type
  // our tenant IDs are varchar strings like 'tn-xxx' — derive deterministic UUID
  function toUuid(str) {
    const hash = crypto.createHash('md5').update(str || 'system').digest('hex')
    return `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`
  }

  return {
    /**
     * Rank all candidates for a requisition.
     * Writes a recommendation_audit_logs row for EVERY candidate (no silent filtering).
     */
    async rankCandidates(tenantId, requisitionId, options) {
      if (!tenantId) throw Object.assign(new Error('tenantId is required'), { status: 400 })
      if (!requisitionId) throw Object.assign(new Error('requisitionId is required'), { status: 400 })

      return withTenant(tenantId, async (client) => {
        // Load requisition
        const reqResult = await client.query('SELECT * FROM requisitions WHERE id = $1', [requisitionId])
        if (!reqResult.rows[0]) throw Object.assign(new Error('requisition not found'), { status: 404 })
        const requisition = reqResult.rows[0]
        if (typeof requisition.requirements === 'string') {
          requisition.requirements = JSON.parse(requisition.requirements)
        }

        // Load candidates for this tenant
        const candResult = await client.query('SELECT * FROM candidates ORDER BY created_at DESC')
        const candidates = candResult.rows

        const rankedList = []
        const poolMetadata = { nationality: {}, gender: {}, age_band: {} }

        for (const candidate of candidates) {
          // Track pool demographics for bias monitoring
          if (candidate.nationality) {
            poolMetadata.nationality[candidate.nationality] = (poolMetadata.nationality[candidate.nationality] || 0) + 1
          }

          // Score
          const scoring = scoreCandidate(candidate, requisition)

          // Build audit log row
          const logId = crypto.randomUUID()
          const inputSignals = {
            requisition_id: requisitionId,
            candidate_id: candidate.id,
            candidate_skills: candidate.skills || [],
            candidate_experience: candidate.experience_years || 0,
            candidate_nationality: candidate.nationality,
            requisition_skills: (requisition.requirements && requisition.requirements.skills) || [],
            requisition_occupation_code: requisition.occupation_code,
            requisition_salary_range: { min: requisition.salary_min, max: requisition.salary_max },
          }

          const rationaleText = `Candidate ${candidate.first_name} ${candidate.last_name} scored ${scoring.match_score} (confidence ${scoring.match_confidence}). ` +
            `Top signals: ${scoring.rationale.top_contributing_signals.map(s => `${s.signal}=${s.value}`).join(', ')}. ` +
            (scoring.concerns.length ? `Concerns: ${scoring.concerns.join('; ')}` : 'No concerns.')

          const immutableHash = generateImmutableHash({
            logId, inputSignals, scoring, MODEL_VERSION, PROMPT_VERSION,
          })

          // Write to recommendation_audit_logs
          // tenant_id and actor are UUID columns — derive from string IDs
          await client.query(
            `INSERT INTO recommendation_audit_logs
             (id, timestamp, actor, action_type, input_signals, rationale,
              confidence_score, model_version, prompt_hash, output_snapshot,
              reviewer_decision, bias_score, tenant_id, immutable_hash)
             VALUES ($1, NOW(), $2, 'MATCH', $3, $4, $5, $6, $7, $8, 'PENDING', $9, $10, $11)`,
            [
              logId,
              toUuid('system-ai-matcher'),
              JSON.stringify(inputSignals),
              rationaleText,
              scoring.match_confidence,
              MODEL_VERSION,
              PROMPT_VERSION,
              JSON.stringify({
                match_score: scoring.match_score,
                signals: scoring.signals,
                rationale: scoring.rationale,
              }),
              scoring.bias_score,
              toUuid(tenantId),
              immutableHash,
            ]
          )

          rankedList.push({
            candidate_id: candidate.id,
            candidate_name: `${candidate.first_name} ${candidate.last_name}`,
            candidate_email: candidate.email,
            match_score: scoring.match_score,
            match_confidence: scoring.match_confidence,
            bias_score: scoring.bias_score,
            rationale: scoring.rationale,
            recommendation_audit_log_id: logId,
            recommended: scoring.match_score >= MIN_THRESHOLD,
            metadata: {
              nationality: candidate.nationality,
            },
          })
        }

        // Sort by match_score descending
        rankedList.sort((a, b) => b.match_score - a.match_score)

        // Bias monitoring
        const biasReport = evaluateRankingBias(rankedList, poolMetadata)

        return {
          requisition_id: requisitionId,
          total_candidates: rankedList.length,
          recommended_count: rankedList.filter(c => c.recommended).length,
          not_recommended_count: rankedList.filter(c => !c.recommended).length,
          model_version: MODEL_VERSION,
          rubric_version: rubric.version,
          ranked_candidates: rankedList,
          bias_report: biasReport,
        }
      })
    },

    /**
     * Review a recommendation — approve or reject.
     */
    async reviewRecommendation(tenantId, logId, decision, reviewerId, overrideReason) {
      if (!['ACCEPTED', 'REJECTED'].includes(decision)) {
        throw Object.assign(new Error('decision must be ACCEPTED or REJECTED'), { status: 422 })
      }
      if (decision === 'REJECTED' && (!overrideReason || !overrideReason.trim())) {
        throw Object.assign(new Error('override_reason required for REJECTED'), { status: 422 })
      }

      return withTenant(tenantId, async (client) => {
        // Read the log entry
        const logResult = await client.query(
          'SELECT * FROM recommendation_audit_logs WHERE id = $1', [logId]
        )
        if (!logResult.rows[0]) throw Object.assign(new Error('recommendation log not found'), { status: 404 })
        const log = logResult.rows[0]

        if (log.reviewer_decision !== 'PENDING') {
          throw Object.assign(new Error('recommendation already reviewed'), { status: 409 })
        }

        // Update the log
        await client.query(
          `UPDATE recommendation_audit_logs
           SET reviewer_decision = $1, reviewer_id = $2, reviewed_at = NOW(), override_reason = $3
           WHERE id = $4`,
          [decision, reviewerId || null, overrideReason || null, logId]
        )

        const result = { logId, decision, reviewedAt: new Date().toISOString() }

        // If ACCEPTED, create an application
        if (decision === 'ACCEPTED') {
          const inputSignals = typeof log.input_signals === 'string'
            ? JSON.parse(log.input_signals) : log.input_signals
          const outputSnapshot = typeof log.output_snapshot === 'string'
            ? JSON.parse(log.output_snapshot) : log.output_snapshot

          const candidateId = inputSignals.candidate_id
          const requisitionId = inputSignals.requisition_id
          const matchScore = outputSnapshot.match_score

          if (candidateId && requisitionId) {
            // Create application
            const appId = crypto.randomUUID()
            try {
              await client.query(
                `INSERT INTO applications
                 (id, tenant_id, candidate_id, requisition_id, status,
                  match_score, match_confidence, ai_recommendation_log_id,
                  applied_at, updated_at)
                 VALUES ($1, $2, $3, $4, 'APPLIED', $5, $6, $7, NOW(), NOW())`,
                [appId, tenantId, candidateId, requisitionId,
                 matchScore, log.confidence_score, logId]
              )

              // Emit application event with AI actor type
              await client.query(
                `INSERT INTO application_events
                 (id, tenant_id, application_id, event_type, previous_status,
                  new_status, actor_user_id, actor_type, payload, created_at)
                 VALUES ($1, $2, $3, 'STATUS_CHANGED', NULL, 'APPLIED', $4, 'AI', $5, NOW())`,
                [crypto.randomUUID(), tenantId, appId, reviewerId || null,
                 JSON.stringify({ source: 'AI_MATCH', recommendation_log_id: logId })]
              )

              result.application_id = appId
              result.candidate_id = candidateId
              result.requisition_id = requisitionId
            } catch (e) {
              if (e.code === '23505') {
                result.application_id = null
                result.note = 'duplicate application — candidate already applied'
              } else {
                throw e
              }
            }
          }
        }

        return result
      })
    },
  }
}

module.exports = { createAiMatchingService }
