'use strict';

// S36-G6: Command Center KPI endpoint
// BRD Refs: WorkCaptain Eval §3.1, §3.2
//
// Routes:
//   GET /api/admin/dashboard/kpi
//     Returns: four KPI values + 7-day trend arrays + entity risk summary
//     Cache: stale-while-revalidate=30 (30-second SWR)
//
// Design:
//   - All KPI values degrade to null when data unavailable — never crash
//   - Status: green >=85%, amber 70-84%, red <70%, unknown when value is null
//   - getTenantStore is injected — router stays testable without server.js

const SWR_TTL_MS = 30_000;

function jsonOk(res, data, status = 200) {
  res.writeHead(status, {
    'content-type':  'application/json',
    'cache-control': 'max-age=0, stale-while-revalidate=30',
  });
  res.end(JSON.stringify({ ok: true, data }));
}

function jsonErr(res, code, message, status = 400) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: { code, message } }));
}

/**
 * Map a percentage value to a status colour band.
 * @param {number|null} value
 * @returns {'green'|'amber'|'red'|'unknown'}
 */
function statusForValue(value) {
  if (value === null || value === undefined) return 'unknown';
  if (value >= 85) return 'green';
  if (value >= 70) return 'amber';
  return 'red';
}

/**
 * Classify entity risk level.
 * @param {'red'|'amber'|'green'} level
 * @param {string}                reason
 */
function riskEntry(id, label, level, reason) {
  return { id, label, level, reason };
}

/**
 * Compute KPI snapshot from tenant store data.
 * All values nullable — caller handles graceful "—" display.
 *
 * @param {Object} tenantData  - { wosWorkers, wosPods, wosAssignments, wosEvidenceEvents }
 * @returns {Object}
 */
function computeKpis(tenantData) {
  const { wosWorkers, wosPods, wosAssignments, wosEvidenceEvents } = tenantData;

  // ── Workforce % ───────────────────────────────────────────────────────────
  const totalWorkers  = wosWorkers.size;
  const activeWorkers = Array.from(wosWorkers.values())
    .filter(w => w && String(w.status || '') === 'active').length;
  const workforcePct = totalWorkers > 0
    ? Math.round((activeWorkers / totalWorkers) * 100)
    : null;

  // ── Compliance % — no scan data yet, degrade gracefully ──────────────────
  const compliancePct = null;

  // ── Trust Score % — no resolution data yet ───────────────────────────────
  const trustScorePct = null;

  // ── Cost vs Budget — no financial data yet ───────────────────────────────
  const costVsBudget = null;

  return {
    workforce:    { value: workforcePct,  trend: [], status: statusForValue(workforcePct),  rawCounts: { active: activeWorkers, total: totalWorkers } },
    compliance:   { value: compliancePct, trend: [], status: statusForValue(compliancePct) },
    trustScore:   { value: trustScorePct, trend: [], status: statusForValue(trustScorePct) },
    costVsBudget: { value: costVsBudget,  trend: [], status: statusForValue(costVsBudget)  },
  };
}

/**
 * Compute entity risk indicators for the Risk Board.
 */
function computeEntityRisk(tenantData) {
  const { wosWorkers, wosPods, wosAssignments } = tenantData;
  const now = Date.now();

  // ── People risk ──────────────────────────────────────────────────────────
  const people = Array.from(wosWorkers.values()).slice(0, 20).map(w => {
    if (!w) return null;
    const status = String(w.status || '');
    if (status === 'active')   return riskEntry(w.id, w.name || w.id, 'green', 'Active worker');
    if (status === 'inactive') return riskEntry(w.id, w.name || w.id, 'amber', 'Worker inactive');
    return riskEntry(w.id, w.name || w.id, 'red', `Unexpected status: ${status || 'none'}`);
  }).filter(Boolean);

  // ── Projects / pods risk ─────────────────────────────────────────────────
  const projects = Array.from(wosPods.values()).slice(0, 20).map(p => {
    if (!p) return null;
    const state = String(p.state || '');
    if (state === 'active')   return riskEntry(p.id, p.name || p.id, 'green', 'Active pod');
    if (state === 'draft')    return riskEntry(p.id, p.name || p.id, 'amber', 'Pod still in draft');
    return riskEntry(p.id, p.name || p.id, 'red', `Pod state: ${state || 'none'}`);
  }).filter(Boolean);

  // ── Assignments / compliance risk ─────────────────────────────────────────
  const compliance = Array.from(wosAssignments.values()).slice(0, 20).map(a => {
    if (!a) return null;
    const state      = String(a.state || '');
    const createdMs  = a.created_at ? new Date(a.created_at).getTime() : 0;
    const ageH       = (now - createdMs) / 3_600_000;

    if (state === 'active')  return riskEntry(a.id, a.title || a.id, 'green', 'Assignment active');
    if (state === 'pending' && ageH > 24) return riskEntry(a.id, a.title || a.id, 'amber', `Pending ${Math.round(ageH)}h — review needed`);
    if (state === 'pending') return riskEntry(a.id, a.title || a.id, 'green', 'Recently created pending assignment');
    return riskEntry(a.id, a.title || a.id, 'amber', `Assignment state: ${state || 'none'}`);
  }).filter(Boolean);

  return { people, projects, compliance };
}

// ── Per-tenant SWR cache ──────────────────────────────────────────────────────
const _cache = new Map(); // tenantId → { data, ts }

function getCached(tenantId) {
  const entry = _cache.get(tenantId);
  if (!entry) return null;
  if (Date.now() - entry.ts > SWR_TTL_MS) return null;
  return entry.data;
}

function setCache(tenantId, data) {
  _cache.set(tenantId, { data, ts: Date.now() });
}

/**
 * Create the dashboard KPI router.
 *
 * @param {Object}   opts
 * @param {Function} opts.getTenantStore  - (tenantId) => tenantData
 * @param {Function} opts.authenticate    - (req) => admin | { ok: false }
 */
function createDashboardRouter({ getTenantStore, authenticate }) {
  if (!getTenantStore) throw new Error('getTenantStore is required');
  if (!authenticate)   throw new Error('authenticate is required');

  async function handle(req, res, url, _body) {
    const admin = await Promise.resolve(authenticate(req)).catch(() => null);
    if (!admin) return jsonErr(res, 'UNAUTHORIZED', 'Authentication required', 401);

    const pathname = url.pathname;

    // ── GET /api/admin/dashboard/kpi ────────────────────────────────────────
    if (req.method === 'GET' && pathname === '/api/admin/dashboard/kpi') {
      const tenantId = req.headers['x-tenant-id'] || (admin && admin.tenantId) || 'default';

      // SWR cache check
      const cached = getCached(tenantId);
      if (cached) {
        res.writeHead(200, {
          'content-type':  'application/json',
          'cache-control': 'max-age=0, stale-while-revalidate=30',
          'x-cache':       'HIT',
        });
        res.end(JSON.stringify({ ok: true, data: cached }));
        return;
      }

      const tenantData = getTenantStore(tenantId);
      const kpis       = computeKpis(tenantData);
      const entities   = computeEntityRisk(tenantData);
      const payload    = { kpis, entities, cachedAt: new Date().toISOString() };

      setCache(tenantId, payload);
      return jsonOk(res, payload);
    }

    return jsonErr(res, 'NOT_FOUND', `No dashboard route for ${req.method} ${pathname}`, 404);
  }

  return { handle, _computeKpis: computeKpis, _computeEntityRisk: computeEntityRisk, _statusForValue: statusForValue };
}

module.exports = { createDashboardRouter, computeKpis, computeEntityRisk, statusForValue };
