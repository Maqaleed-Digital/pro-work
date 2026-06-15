'use strict';

// S36-G2: AI Governance — /api/admin/ai routes
// BRD Refs: Gold BRD A4, RT-1 §5.2, WOS §11.2
//
// Routes:
//   GET  /api/admin/ai/audit-log              — list with filters + pagination
//   GET  /api/admin/ai/audit-log/pending/count — count for nav badge
//   GET  /api/admin/ai/audit-log/export        — regulator export (logged)
//   PATCH /api/admin/ai/audit-log/:id/decision — human approve/reject/override
//
// Constraint: AI must NEVER auto-approve. All decision changes require
// explicit human action via PATCH — no auto-close path exists in this module.

const VALID_DECISIONS = ['ACCEPTED', 'REJECTED', 'OVERRIDDEN'];
const REASON_REQUIRED = ['REJECTED', 'OVERRIDDEN'];
const MIN_REASON_LENGTH = 10;

function jsonOk(res, data, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, data }));
}

function jsonErr(res, code, message, status = 400) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: { code, message } }));
}

/**
 * Create the AI audit log router.
 *
 * @param {{ auditLogService: Object, authenticate: Function }} deps
 *   auditLogService: instance from createAuditLogService()
 *   authenticate:    function(req) → { ok, principal } — same pattern as Admin.authenticate
 */
function createAiRouter({ auditLogService, authenticate }) {
  if (!auditLogService) throw new Error('auditLogService is required');
  if (typeof authenticate !== 'function') throw new Error('authenticate is required');

  return {
    /**
     * Returns true if this router handles the given method + pathname.
     */
    matches(method, pathname) {
      if (pathname === '/api/admin/ai/audit-log')                return true;
      if (pathname === '/api/admin/ai/audit-log/pending/count')   return true;
      if (pathname === '/api/admin/ai/audit-log/export')          return true;
      if (method === 'PATCH' && /^\/api\/admin\/ai\/audit-log\/[^/]+\/decision$/.test(pathname)) return true;
      return false;
    },

    async handle(req, res, parsedUrl, body) {
      const { method } = req;
      const pathname = parsedUrl.pathname;
      const query    = parsedUrl.searchParams || new URLSearchParams(parsedUrl.search || '');

      // Auth — all AI routes require admin authentication
      const auth = authenticate(req);
      if (!auth.ok) {
        return jsonErr(res, 'UNAUTHORIZED', 'authentication required', 401);
      }

      const tenantId = req.headers['x-tenant-id'] || query.get('tenantId') || 'default';

      // ── GET /api/admin/ai/audit-log/pending/count ───────────────────────────
      if (method === 'GET' && pathname === '/api/admin/ai/audit-log/pending/count') {
        try {
          const entries = await auditLogService.query(tenantId, {
            reviewerDecision: 'PENDING',
            limit: 10000,
          });
          return jsonOk(res, { count: entries.length });
        } catch (e) {
          return jsonErr(res, 'QUERY_ERROR', e.message, 500);
        }
      }

      // ── GET /api/admin/ai/audit-log/export ──────────────────────────────────
      if (method === 'GET' && pathname === '/api/admin/ai/audit-log/export') {
        try {
          const format = query.get('format') || 'json';

          const exportData = await auditLogService.exportForRegulator(tenantId);

          // Log the export action as a SYSTEM entry (BRD requirement)
          try {
            await auditLogService.write({
              tenant_id:        tenantId,
              actor:            auth.principal ? auth.principal.id || 'system' : 'system',
              action_type:      'SUMMARY',
              input_signals:    { export_format: format, exported_entries: exportData.total_entries },
              rationale:        'Audit log exported by administrator',
              confidence_score: 1.0,
              model_version:    'system',
              output_snapshot:  { export_version: exportData.export_version, total_entries: exportData.total_entries },
            });
          } catch (_) {
            // Export logging failure must not block the export itself
          }

          if (format === 'csv') {
            const headers = [
              'id', 'timestamp', 'actor', 'action_type', 'confidence_score',
              'model_version', 'reviewer_decision', 'reviewer_id', 'reviewed_at',
              'bias_score', 'bias_flagged', 'tenant_id',
            ];
            const rows = exportData.entries.map(e =>
              headers.map(h => {
                const v = e[h];
                if (v === null || v === undefined) return '';
                const s = String(v);
                return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
              }).join(',')
            );
            const csv = [headers.join(','), ...rows].join('\n');
            res.writeHead(200, {
              'content-type': 'text/csv',
              'content-disposition': `attachment; filename="ai-audit-log-${tenantId}-${Date.now()}.csv"`,
            });
            return res.end(csv);
          }

          // Default: JSON
          res.writeHead(200, {
            'content-type': 'application/json',
            'content-disposition': `attachment; filename="ai-audit-log-${tenantId}-${Date.now()}.json"`,
          });
          return res.end(JSON.stringify(exportData, null, 2));
        } catch (e) {
          return jsonErr(res, 'EXPORT_ERROR', e.message, 500);
        }
      }

      // ── GET /api/admin/ai/audit-log ──────────────────────────────────────────
      if (method === 'GET' && pathname === '/api/admin/ai/audit-log') {
        try {
          const limit  = Math.min(100, Math.max(1, parseInt(query.get('limit') || '25', 10)));
          const offset = Math.max(0, parseInt(query.get('offset') || '0', 10));
          const reviewerDecision = query.get('reviewerDecision') || undefined;

          const entries = await auditLogService.query(tenantId, {
            limit,
            offset,
            reviewerDecision,
          });

          // Total count for pagination (separate query without offset)
          const all = await auditLogService.query(tenantId, { limit: 100000, reviewerDecision });
          const total = all.length;

          return jsonOk(res, { entries, total, limit, offset });
        } catch (e) {
          return jsonErr(res, 'QUERY_ERROR', e.message, 500);
        }
      }

      // ── PATCH /api/admin/ai/audit-log/:id/decision ──────────────────────────
      const decisionMatch = pathname.match(/^\/api\/admin\/ai\/audit-log\/([^/]+)\/decision$/);
      if (method === 'PATCH' && decisionMatch) {
        const entryId = decisionMatch[1];

        try {
          const { decision, reason, reviewerId } = body || {};

          if (!VALID_DECISIONS.includes(decision)) {
            return jsonErr(res, 'INVALID_DECISION',
              `decision must be one of: ${VALID_DECISIONS.join(', ')}`);
          }

          if (REASON_REQUIRED.includes(decision)) {
            if (!reason || String(reason).trim().length < MIN_REASON_LENGTH) {
              return jsonErr(res, 'REASON_REQUIRED',
                `${decision} requires a reason of at least ${MIN_REASON_LENGTH} characters`);
            }
          }

          if (!reviewerId) {
            return jsonErr(res, 'REVIEWER_REQUIRED', 'reviewerId is required');
          }

          // Fetch and verify entry exists and belongs to tenant
          const existing = await auditLogService.get(entryId, tenantId);
          if (!existing) {
            return jsonErr(res, 'NOT_FOUND', `audit log entry not found: ${entryId}`, 404);
          }

          // Record the decision via a new SUMMARY log entry (append-only architecture)
          // The original entry is immutable — decisions are recorded as linked events
          const decisionEntry = await auditLogService.write({
            tenant_id:        tenantId,
            actor:            reviewerId,
            action_type:      'SUMMARY',
            input_signals:    {
              original_entry_id: entryId,
              decision,
              reason: reason || null,
            },
            rationale:        `Human reviewer ${decision.toLowerCase()} recommendation ${entryId}`,
            confidence_score: 1.0,
            model_version:    'human-review',
            output_snapshot:  {
              original_entry_id: entryId,
              decision,
              reviewer_id:  reviewerId,
              reviewed_at:  new Date().toISOString(),
              override_reason: REASON_REQUIRED.includes(decision) ? reason : null,
            },
          });

          return jsonOk(res, {
            original_entry_id: entryId,
            decision_entry_id: decisionEntry.id,
            decision,
            reviewed_at:       decisionEntry.timestamp,
            reviewer_id:       reviewerId,
          });
        } catch (e) {
          if (e.name === 'ImmutableHashError') {
            return jsonErr(res, 'INTEGRITY_ERROR', e.message, 500);
          }
          return jsonErr(res, 'DECISION_ERROR', e.message, 500);
        }
      }

      return jsonErr(res, 'NOT_FOUND', `no AI route matches ${method} ${pathname}`, 404);
    },
  };
}

module.exports = { createAiRouter };
