'use strict';

const { overlapScore, missingSkills } = require('./skill_graph');
const { previewNitaqatImpact, validateOccupationMatch } = require('./compliance_preview');

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'MatchingEngineError';
    throw err;
  }
}

class InMemoryMatchStore {
  constructor() {
    this.rows = [];
  }

  async insert(row) {
    this.rows.push(JSON.parse(JSON.stringify(row)));
    return JSON.parse(JSON.stringify(row));
  }

  async all() {
    return JSON.parse(JSON.stringify(this.rows));
  }
}

function createMatchingEngine({ matchStore, hooks }) {
  assert(matchStore, 'matchStore is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  return {
    async rankCandidates(input) {
      assert(input && typeof input === 'object', 'ranking input is required');
      assert(Array.isArray(input.candidates), 'candidates must be an array');
      assert(input.requisition, 'requisition is required');

      const ranked = [];

      for (const candidate of input.candidates) {
        const skillScore  = overlapScore(candidate, input.requisition);
        const missing     = missingSkills(candidate, input.requisition);
        const nitaqat     = previewNitaqatImpact({
          candidate,
          requisition:    input.requisition,
          employerProfile: input.employerProfile,
          overrideInput:  input.overrideInputByCandidateId && input.overrideInputByCandidateId[candidate.candidate_id],
        });
        const occupation = validateOccupationMatch({
          candidate,
          requisition: input.requisition,
          policyRules: input.policyRules,
        });

        const internalBoost       = candidate.candidate_type === 'FTE' ? 0.15 : 0;
        const availabilityBoost   = candidate.availability_status === 'AVAILABLE' ? 0.1 : 0;
        const compliancePenalty   = occupation.valid ? 0 : 0.25;
        const nitaqatComponent    = (nitaqat.preview_score / 100) * 0.2;

        const finalScore = Math.max(0, Math.min(1,
          (skillScore * 0.55) + internalBoost + availabilityBoost + nitaqatComponent - compliancePenalty
        ));

        const explanation = [
          `skill_overlap=${skillScore.toFixed(2)}`,
          `internal_priority=${candidate.candidate_type === 'FTE' ? 'yes' : 'no'}`,
          `availability=${candidate.availability_status}`,
          `nitaqat=${nitaqat.movement_band}`,
          `occupation_valid=${occupation.valid ? 'yes' : 'no'}`,
        ];

        const result = {
          candidate_id:          candidate.candidate_id,
          requisition_id:        input.requisition.requisition_id,
          final_score:           Number(finalScore.toFixed(4)),
          ranking_reason:        explanation,
          missing_skills:        missing,
          nitaqat_preview:       nitaqat,
          occupation_validation: occupation,
        };

        ranked.push(result);
        await matchStore.insert(result);

        await hooks.publish({
          event_id:       input.event_ids.candidate_matched[candidate.candidate_id],
          event_type:     'CANDIDATE_MATCHED',
          event_version:  '1.0',
          occurred_at:    input.occurred_at,
          tenant_id:      input.requisition.tenant_id,
          aggregate_type: 'REQUISITION',
          aggregate_id:   input.requisition.requisition_id,
          actor:          input.actor,
          correlation_id: input.correlation_id,
          causation_id:   input.causation_id,
          source: { service: 'recruiting', module: 'matching_engine', environment: process.env.NODE_ENV || 'development' },
          trust_level: 'STANDARD', requires_approval: false,
          payload: {
            requisition_id:     input.requisition.requisition_id,
            candidate_id:       candidate.candidate_id,
            final_score:        Number(finalScore.toFixed(4)),
            candidate_type:     candidate.candidate_type,
            missing_skill_count: missing.length,
          },
          metadata: {},
        });

        await hooks.publish({
          event_id:       input.event_ids.nitaqat_preview_generated[candidate.candidate_id],
          event_type:     'NITAQAT_PREVIEW_GENERATED',
          event_version:  '1.0',
          occurred_at:    input.occurred_at,
          tenant_id:      input.requisition.tenant_id,
          aggregate_type: 'CANDIDATE',
          aggregate_id:   candidate.candidate_id,
          actor:          input.actor,
          correlation_id: input.correlation_id,
          causation_id:   input.causation_id,
          source: { service: 'recruiting', module: 'matching_engine', environment: process.env.NODE_ENV || 'development' },
          trust_level: 'HIGH', requires_approval: true,
          payload: {
            candidate_id:     candidate.candidate_id,
            requisition_id:   input.requisition.requisition_id,
            movement_band:    nitaqat.movement_band,
            confidence_band:  nitaqat.confidence_band,
            override_applied: nitaqat.override_applied,
            driver_count:     nitaqat.drivers.length,
          },
          metadata: {},
        });

        await hooks.publish({
          event_id:       input.event_ids.occupation_match_validated[candidate.candidate_id],
          event_type:     'OCCUPATION_MATCH_VALIDATED',
          event_version:  '1.0',
          occurred_at:    input.occurred_at,
          tenant_id:      input.requisition.tenant_id,
          aggregate_type: 'CANDIDATE',
          aggregate_id:   candidate.candidate_id,
          actor:          input.actor,
          correlation_id: input.correlation_id,
          causation_id:   input.causation_id,
          source: { service: 'recruiting', module: 'matching_engine', environment: process.env.NODE_ENV || 'development' },
          trust_level: 'HIGH', requires_approval: true,
          payload: {
            candidate_id:                candidate.candidate_id,
            requisition_id:              input.requisition.requisition_id,
            valid:                       occupation.valid,
            issue_count:                 occupation.issues.length,
            recommended_occupation_code: occupation.recommended_occupation_code,
          },
          metadata: {},
        });

        await hooks.publish({
          event_id:       input.event_ids.ai_match_explanation_logged[candidate.candidate_id],
          event_type:     'AI_MATCH_EXPLANATION_LOGGED',
          event_version:  '1.0',
          occurred_at:    input.occurred_at,
          tenant_id:      input.requisition.tenant_id,
          aggregate_type: 'REQUISITION',
          aggregate_id:   input.requisition.requisition_id,
          actor:          input.actor,
          correlation_id: input.correlation_id,
          causation_id:   input.causation_id,
          source: { service: 'recruiting', module: 'matching_engine', environment: process.env.NODE_ENV || 'development' },
          trust_level: 'HIGH', requires_approval: true,
          payload: {
            requisition_id:   input.requisition.requisition_id,
            candidate_id:     candidate.candidate_id,
            final_score:      Number(finalScore.toFixed(4)),
            explanation,
            reviewer_required: true,
          },
          metadata: {},
        });
      }

      ranked.sort((a, b) => b.final_score - a.final_score);
      return ranked;
    },

    async shortlistCandidate(input) {
      assert(input && typeof input === 'object', 'shortlist input is required');

      await hooks.publish({
        event_id:       input.event_id,
        event_type:     'CANDIDATE_SHORTLISTED',
        event_version:  '1.0',
        occurred_at:    input.occurred_at,
        tenant_id:      input.tenant_id,
        aggregate_type: 'REQUISITION',
        aggregate_id:   input.requisition_id,
        actor:          input.actor,
        correlation_id: input.correlation_id,
        causation_id:   input.causation_id,
        source: { service: 'recruiting', module: 'matching_engine', environment: process.env.NODE_ENV || 'development' },
        trust_level: 'HIGH', requires_approval: true,
        payload: {
          requisition_id:   input.requisition_id,
          candidate_id:     input.candidate_id,
          shortlist_reason: input.shortlist_reason,
          reviewer_outcome: input.reviewer_outcome || 'PENDING',
        },
        metadata: input.metadata || {},
      });

      return {
        requisition_id:   input.requisition_id,
        candidate_id:     input.candidate_id,
        shortlist_reason: input.shortlist_reason,
        reviewer_outcome: input.reviewer_outcome || 'PENDING',
      };
    },
  };
}

module.exports = {
  createMatchingEngine,
  InMemoryMatchStore,
};
