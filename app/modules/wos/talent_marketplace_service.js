'use strict';

const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');

const POLICY = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../config/workforce/talent_marketplace_policy_v1.json'),
    'utf8'
  )
);

const FTE_FIRST      = POLICY.fteFirst;
const ALLOC          = POLICY.allocation;
const AUDIT_CFG      = POLICY.auditLog;

// ── helpers ───────────────────────────────────────────────────────────────────

function marketplaceError(message) {
  const err = new Error(message);
  err.name = 'TalentMarketplaceError';
  return err;
}

function assert(condition, message) {
  if (!condition) throw marketplaceError(message);
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function nowIso() { return new Date().toISOString(); }

// ── Skill matching ────────────────────────────────────────────────────────────

/**
 * computeSkillMatch — returns a 0–100 percentage of required skills covered.
 * Exact match (case-insensitive) on skill name.
 */
function computeSkillMatch(workerSkills, requiredSkills) {
  if (!requiredSkills || requiredSkills.length === 0) return 100;
  if (!workerSkills   || workerSkills.length   === 0) return 0;

  const workerSet = new Set(workerSkills.map(s => String(s).toLowerCase().trim()));
  const matched   = requiredSkills.filter(s => workerSet.has(String(s).toLowerCase().trim()));
  return Math.round((matched.length / requiredSkills.length) * 100);
}

// ── Utilization ───────────────────────────────────────────────────────────────

/**
 * computeUtilization — returns utilization percentage based on current allocations.
 */
function computeUtilization(worker) {
  const weeklyAvailable = worker.weekly_available_hours ?? ALLOC.weeklyStandardHours;
  if (weeklyAvailable <= 0) return 100;
  const allocated = (worker.current_allocations || []).reduce((sum, a) => sum + (a.hours || 0), 0);
  return Math.round((allocated / weeklyAvailable) * 100);
}

/**
 * detectAllocationConflict — checks if proposedHours would push worker over capacity.
 * Returns a conflict descriptor or null if no conflict.
 * NEVER silently accepts: always returns an explicit result.
 */
function detectAllocationConflict(worker, proposedHours) {
  assert(worker,          'worker is required');
  assert(proposedHours >= 0, 'proposedHours must be >= 0');

  const weeklyAvailable = worker.weekly_available_hours ?? ALLOC.weeklyStandardHours;
  const currentAllocated = (worker.current_allocations || []).reduce((sum, a) => sum + (a.hours || 0), 0);
  const remainingHours   = weeklyAvailable - currentAllocated;
  const wouldAllocate    = currentAllocated + proposedHours;
  const newUtilization   = weeklyAvailable > 0 ? Math.round((wouldAllocate / weeklyAvailable) * 100) : 100;

  if (wouldAllocate > weeklyAvailable) {
    return {
      conflict:             true,
      severity:             ALLOC.conflictSeverity,
      worker_id:            worker.worker_id,
      worker_type:          worker.type,            // always visible
      weekly_available:     weeklyAvailable,
      currently_allocated:  currentAllocated,
      proposed_hours:       proposedHours,
      would_allocate_total: wouldAllocate,
      remaining_hours:      remainingHours,
      new_utilization_pct:  newUtilization,
      message: `Allocation conflict: ${worker.display_name || worker.worker_id} — ` +
               `proposed ${proposedHours}h would result in ${wouldAllocate}h/${weeklyAvailable}h ` +
               `(${newUtilization}%) — requires approval before assignment`,
    };
  }

  return {
    conflict:             false,
    worker_id:            worker.worker_id,
    worker_type:          worker.type,
    weekly_available:     weeklyAvailable,
    currently_allocated:  currentAllocated,
    proposed_hours:       proposedHours,
    would_allocate_total: wouldAllocate,
    remaining_hours:      remainingHours,
    new_utilization_pct:  newUtilization,
  };
}

// ── FTE extension fields ──────────────────────────────────────────────────────

function buildWorkerProfile(worker, requiredSkills) {
  const skillMatch     = computeSkillMatch(worker.skills, requiredSkills);
  const utilization    = computeUtilization(worker);
  const availabilityPct = Math.max(0, 100 - utilization);

  const profile = {
    worker_id:          worker.worker_id,
    tenant_id:          worker.tenant_id,
    display_name:       worker.display_name,
    worker_type:        worker.type,          // ALWAYS VISIBLE — never omit
    status:             worker.status,
    skills:             worker.skills || [],
    skill_match_pct:    skillMatch,
    utilization_pct:    utilization,
    availability_pct:   availabilityPct,
    weekly_available_hours: worker.weekly_available_hours ?? ALLOC.weeklyStandardHours,
    current_allocations:    worker.current_allocations    ?? [],
    compliance_status:  worker.compliance_status          ?? null,
  };

  // FTE-specific extension fields — always included when type=FTE
  if (worker.type === 'FTE') {
    profile.employment_start_date  = worker.employment_start_date  ?? null;
    profile.establishment          = worker.establishment          ?? null;
    profile.cost_center            = worker.cost_center            ?? null;
    profile.line_manager           = worker.line_manager           ?? null;
    profile.contract_type          = worker.contract_type          ?? null;
    profile.probation_status       = worker.probation_status       ?? null;
    profile.wps_readiness_status   = worker.wps_readiness_status   ?? null;
  }

  return profile;
}

// ── Core search ───────────────────────────────────────────────────────────────

/**
 * searchForRole — FTE-first internal talent marketplace search.
 *
 * Algorithm:
 * 1. Filter all workers in tenant to ACTIVE status
 * 2. Compute skill match % for each
 * 3. Separate FTE and FREELANCER pools
 * 4. Score and sort FTEs first — those meeting minimums go into results
 * 5. If FTE pool insufficient → log fallback to audit log, expand to freelancers
 * 6. Merge and return ordered results (FTE first, then freelancers)
 *
 * @returns { results, search_path, fallback_used, fallback_trigger, fallback_rationale }
 */
async function searchForRole(input, allWorkers, auditLogService) {
  assert(input && typeof input === 'object', 'input is required');
  assert(input.tenant_id,                  'tenant_id is required');
  assert(Array.isArray(input.required_skills), 'required_skills must be an array');

  const requiredSkills  = input.required_skills;
  const proposedHours   = input.proposed_weekly_hours ?? 0;
  const tenantWorkers   = allWorkers.filter(w => w.tenant_id === input.tenant_id && w.status === 'ACTIVE');

  // Score all workers
  const scored = tenantWorkers.map(w => {
    const profile       = buildWorkerProfile(w, requiredSkills);
    const conflictCheck = proposedHours > 0 ? detectAllocationConflict(w, proposedHours) : null;
    return { ...profile, conflict: conflictCheck };
  });

  // Partition by type — FTE FIRST is a business rule
  const ftePool        = scored.filter(w => w.worker_type === 'FTE');
  const freelancerPool = scored.filter(w => w.worker_type === 'FREELANCER');

  // Find viable FTEs: meet skill + availability thresholds
  const viableFtes = ftePool
    .filter(w =>
      w.skill_match_pct    >= FTE_FIRST.minimumSkillMatchPercent &&
      w.availability_pct   >= FTE_FIRST.minimumAvailabilityPercent &&
      (!w.conflict || !w.conflict.conflict)  // filter out conflicted unless no other option
    )
    .sort((a, b) => b.skill_match_pct - a.skill_match_pct || b.availability_pct - a.availability_pct);

  // Determine fallback trigger
  let fallbackTrigger   = null;
  let fallbackRationale = null;
  let fallbackUsed      = false;
  let searchPath        = ['FTE'];

  if (ftePool.length === 0) {
    fallbackTrigger = FTE_FIRST.fallbackTriggers.noFteFound;
  } else if (ftePool.every(w => w.utilization_pct >= ALLOC.maxUtilizationPercent)) {
    fallbackTrigger = FTE_FIRST.fallbackTriggers.capacityExhausted;
  } else if (ftePool.every(w => w.skill_match_pct < FTE_FIRST.minimumSkillMatchPercent)) {
    fallbackTrigger = FTE_FIRST.fallbackTriggers.skillGap;
  } else if (viableFtes.length === 0 && ftePool.length > 0) {
    fallbackTrigger = FTE_FIRST.fallbackTriggers.partialCapacity;
  }

  let results;

  if (viableFtes.length > 0) {
    // FTE viables found — no fallback needed
    results = viableFtes;
  } else {
    // Fallback to freelancer marketplace
    fallbackUsed      = true;
    fallbackRationale = FTE_FIRST.fallbackRationale[fallbackTrigger] || 'FTE pool insufficient';
    searchPath        = ['FTE', 'FREELANCER'];

    // Log fallback to recommendation_audit_logs via S36-G1 audit service
    // auditLogService is injected — null/absent skips logging gracefully in tests
    if (auditLogService && typeof auditLogService.write === 'function') {
      const auditActor = input.actor || { actor_type: 'SYSTEM', actor_id: 'talent-marketplace' };
      await auditLogService.write({
        tenant_id:        input.tenant_id,
        actor:            auditActor,
        action_type:      AUDIT_CFG.actionType,  // 'RECOMMENDATION'
        confidence_score: AUDIT_CFG.fallbackConfidence,
        model_version:    AUDIT_CFG.modelVersion,
        rationale:        fallbackRationale,
        input_signals: {
          required_skills:    requiredSkills,
          proposed_hours:     proposedHours,
          fte_pool_size:      ftePool.length,
          viable_fte_count:   viableFtes.length,
          fallback_trigger:   fallbackTrigger,
        },
        output_snapshot: {
          fallback_used:      true,
          fallback_trigger:   fallbackTrigger,
          fallback_rationale: fallbackRationale,
          freelancer_count:   freelancerPool.length,
        },
      });
    }

    // Fallback results: all FTEs (even below-threshold) + freelancers, FTE still first
    const allFtesSorted = ftePool.sort((a, b) => b.skill_match_pct - a.skill_match_pct);
    const freelancersSorted = freelancerPool.sort((a, b) => b.skill_match_pct - a.skill_match_pct);
    results = [...allFtesSorted, ...freelancersSorted];
  }

  return {
    results:            results.slice(0, POLICY.search.maxResults),
    search_path:        searchPath,
    fallback_used:      fallbackUsed,
    fallback_trigger:   fallbackTrigger,
    fallback_rationale: fallbackRationale,
    fte_count:          results.filter(r => r.worker_type === 'FTE').length,
    freelancer_count:   results.filter(r => r.worker_type === 'FREELANCER').length,
    policy_version:     POLICY.version,
  };
}

// ── Service factory ───────────────────────────────────────────────────────────

function createTalentMarketplaceService({ workerStore, auditLogService }) {
  assert(workerStore, 'workerStore is required');
  // auditLogService is optional — absent means no fallback logging (for tests without S36-G1)

  return {
    async searchForRole(input) {
      assert(input && typeof input === 'object', 'input is required');
      const allWorkers = await workerStore.list(null);  // all tenants; searchForRole filters by tenant_id
      return searchForRole(input, allWorkers, auditLogService || null);
    },

    detectAllocationConflict,
    computeUtilization,
    computeSkillMatch,
    buildWorkerProfile,
    POLICY,
  };
}

module.exports = {
  createTalentMarketplaceService,
  computeSkillMatch,
  computeUtilization,
  detectAllocationConflict,
  buildWorkerProfile,
  POLICY,
};
