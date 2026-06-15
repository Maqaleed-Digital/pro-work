'use strict';

/**
 * Day-80 Probation Automation
 * ───────────────────────────
 * Background job that finds all active probation cases where day >= 80
 * and evidence pack has not been compiled, then auto-compiles each pack.
 *
 * Design principles:
 * - Idempotent: safe to re-run; will not duplicate packs
 * - Separately testable: all dependencies injected (store, service, now)
 * - Human decisions NOT triggered here — automation only compiles evidence,
 *   notifies HR, and sets evidencePackStatus; final decision remains human-only
 */

const crypto = require('crypto');

function nowIso() { return new Date().toISOString(); }

/**
 * runOnce({ store, governanceService, hooks, now })
 *
 * @param store              — InMemoryProbationGovernanceStore (or DB adapter)
 * @param governanceService  — createProbationGovernanceService instance
 * @param hooks              — { publish } for notifications
 * @param now                — Date | string — injectable for tests (default: system clock)
 *
 * @returns {
 *   run_at:              ISO string,
 *   cases_scanned:       number,
 *   packs_compiled:      number,
 *   already_compiled:    number,
 *   errors:              Array<{ governance_case_id, error }>,
 *   notifications_sent:  number,
 * }
 */
async function runOnce({ store, governanceService, hooks, now }) {
  const runAt   = nowIso();
  const nowDate = now instanceof Date ? now : (now ? new Date(now) : new Date());

  const due = await store.findDay80Due(nowDate);

  const result = {
    run_at:             runAt,
    cases_scanned:      due.length,
    packs_compiled:     0,
    already_compiled:   0,
    errors:             [],
    notifications_sent: 0,
  };

  for (const probCase of due) {
    try {
      // Idempotent guard already inside compileProbationEvidencePack;
      // additionally enforced by findDay80Due (only returns uncompiled cases)
      await governanceService.compileProbationEvidencePack({
        governance_case_id: probCase.governance_case_id,
        evidence_pack_id:   `ep-day80-${probCase.governance_case_id}`,
        compiled_at:        nowDate.toISOString(),
        // Default signals from stored evidence_signals if available
        task_completion_count:   probCase.evidence_signals?.task_completion_count   ?? 0,
        manager_review_count:    probCase.evidence_signals?.manager_review_count    ?? 0,
        policy_ack_count:        probCase.evidence_signals?.policy_ack_count        ?? 0,
        attendance_signal_count: probCase.evidence_signals?.attendance_signal_count ?? 0,
        actor: { actor_type: 'SYSTEM', actor_id: 'day80-automation' },
        event_id:       crypto.randomUUID(),
        correlation_id: `day80-run-${runAt}`,
        causation_id:   `day80-run-${runAt}`,
        metadata:       { automation: 'day80', run_at: runAt },
      });

      result.packs_compiled++;

      // Emit notification event — HR Manager + Hiring Manager
      await hooks.publish({
        event_id:       crypto.randomUUID(),
        event_type:     'DAY80_PROBATION_NOTIFICATION',
        event_version:  '1.0',
        occurred_at:    nowDate.toISOString(),
        tenant_id:      probCase.tenant_id,
        aggregate_type: 'ONBOARDING_CASE',
        aggregate_id:   probCase.onboarding_case_id,
        actor:          { actor_type: 'SYSTEM', actor_id: 'day80-automation' },
        correlation_id: `day80-run-${runAt}`,
        causation_id:   `day80-run-${runAt}`,
        source: {
          service:     'onboarding',
          module:      'day80_automation',
          environment: process.env.NODE_ENV || 'development',
        },
        trust_level:       'HIGH',
        requires_approval: false,
        payload: {
          governance_case_id: probCase.governance_case_id,
          worker_id:          probCase.worker_id,
          tenant_id:          probCase.tenant_id,
          onboarding_case_id: probCase.onboarding_case_id,
          notify_roles:       ['HR_MANAGER', 'HIRING_MANAGER'],
          message:            'Day-80 evidence pack compiled. Human decision required.',
          evidence_pack_id:   `ep-day80-${probCase.governance_case_id}`,
        },
        metadata: { automation: 'day80', run_at: runAt },
      });

      result.notifications_sent++;
    } catch (e) {
      result.errors.push({
        governance_case_id: probCase.governance_case_id,
        error:              e.message || String(e),
      });
    }
  }

  return result;
}

module.exports = { runOnce };
