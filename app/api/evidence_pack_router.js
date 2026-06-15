'use strict';

const { buildZip } = require('../lib/zip');
const { createEvidencePackService, InMemoryEvidencePackStore } = require('../modules/evidence/evidence_pack_service');

/**
 * createEvidencePackRouter({ store?, svc? })
 *
 * Routes handled (all require tenant isolation via X-Tenant-Id header):
 *   GET  /api/evidence/packs                    — list packs for tenant
 *   GET  /api/evidence/packs/:id                — get + verify pack (role-redacted)
 *   POST /api/evidence/packs/:id/export         — export single pack (JSON or ZIP)
 *   POST /api/evidence/bulk-export              — bulk export multiple packs → ZIP
 *   GET  /api/evidence/audit                    — tenant audit trail
 *
 * Integrity: every GET /packs/:id calls verifyHash — returns 409 INTEGRITY_VIOLATION
 * if stored hash does not match computed hash. Never silent.
 *
 * Export SLA: ≤60 seconds for single pack (enforced in tests; generatedInMs returned).
 */
function createEvidencePackRouter({ store, svc } = {}) {
  const epStore = store || new InMemoryEvidencePackStore();
  const epSvc   = svc   || createEvidencePackService({ store: epStore });
  const auditLog = [];  // { tenant_id, pack_id, event, actor_role, timestamp }

  function recordAudit(tenantId, packId, event, actorRole) {
    auditLog.push({
      tenant_id:  tenantId,
      pack_id:    packId || null,
      event,
      actor_role: String(actorRole || 'VIEWER').toUpperCase(),
      timestamp:  new Date().toISOString(),
    });
  }

  function okResp(res, data, status = 200) {
    const body = JSON.stringify({ ok: true, data });
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
  }

  function failResp(res, code, message, status = 400) {
    const body = JSON.stringify({ ok: false, error: { code, message } });
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
  }

  async function handle(req, res, pathname, method, tenantId, body) {
    try {
      const role = String(req.headers['x-requesting-role'] || 'VIEWER').toUpperCase();

      // ── GET /api/evidence/packs ──────────────────────────────────────────
      if (method === 'GET' && pathname === '/api/evidence/packs') {
        const packs = await epSvc.listByTenant(tenantId);
        recordAudit(tenantId, null, 'packs.listed', role);
        return okResp(res, { packs, count: packs.length });
      }

      // ── GET /api/evidence/packs/:id ──────────────────────────────────────
      const packMatch = pathname.match(/^\/api\/evidence\/packs\/([^/]+)$/);
      if (method === 'GET' && packMatch) {
        const packId = packMatch[1];
        let pack;
        try {
          pack = await epSvc.get(packId, tenantId, role);
        } catch (err) {
          if (err.name === 'EvidenceIntegrityError') {
            return failResp(res, 'INTEGRITY_VIOLATION', err.message, 409);
          }
          if (err.code === 'PACK_NOT_FOUND')  return failResp(res, 'PACK_NOT_FOUND', err.message, 404);
          if (err.code === 'TENANT_MISMATCH') return failResp(res, 'TENANT_MISMATCH', err.message, 403);
          throw err;
        }
        recordAudit(tenantId, packId, 'pack.viewed', role);
        return okResp(res, { pack, integrity: 'VERIFIED' });
      }

      // ── POST /api/evidence/packs/:id/export ──────────────────────────────
      const exportMatch = pathname.match(/^\/api\/evidence\/packs\/([^/]+)\/export$/);
      if (method === 'POST' && exportMatch) {
        const packId     = exportMatch[1];
        const format     = String((body && body.format) || 'JSON').toUpperCase();
        const exportRole = String((body && body.requestingRole) || role).toUpperCase();

        const t0 = Date.now();
        let result;
        try {
          result = await epSvc.export(packId, tenantId, format, exportRole);
        } catch (err) {
          if (err.name === 'EvidenceIntegrityError') return failResp(res, 'INTEGRITY_VIOLATION', err.message, 409);
          if (err.code === 'PACK_NOT_FOUND')   return failResp(res, 'PACK_NOT_FOUND',   err.message, 404);
          if (err.code === 'PACK_NOT_CLOSED')  return failResp(res, 'PACK_NOT_CLOSED',  err.message, 422);
          if (err.code === 'TENANT_MISMATCH')  return failResp(res, 'TENANT_MISMATCH',  err.message, 403);
          if (err.code === 'INVALID_FORMAT')   return failResp(res, 'INVALID_FORMAT',   err.message, 400);
          throw err;
        }
        const generatedInMs = Date.now() - t0;
        recordAudit(tenantId, packId, `pack.exported.${format}`, exportRole);

        if (format === 'ZIP') {
          const files = { [`${packId}.json`]: Buffer.from(JSON.stringify(result.data, null, 2)) };
          const zipBuf = buildZip(files);
          res.writeHead(200, {
            'content-type':        'application/zip',
            'content-disposition': `attachment; filename="${packId}.zip"`,
            'cache-control':       'no-store',
            'x-generated-in-ms':   String(generatedInMs),
          });
          return res.end(zipBuf);
        }

        return okResp(res, { ...result, generated_in_ms: generatedInMs });
      }

      // ── POST /api/evidence/bulk-export ───────────────────────────────────
      if (method === 'POST' && pathname === '/api/evidence/bulk-export') {
        const packIds    = (body && Array.isArray(body.pack_ids)) ? body.pack_ids : [];
        const exportRole = String((body && body.requestingRole) || role).toUpperCase();
        if (packIds.length === 0) {
          return failResp(res, 'NO_PACKS_SELECTED', 'pack_ids must be a non-empty array', 400);
        }

        const t0 = Date.now();
        const files  = {};
        const errors = [];

        for (const packId of packIds) {
          try {
            const result = await epSvc.export(packId, tenantId, 'JSON', exportRole);
            files[`${packId}.json`] = Buffer.from(JSON.stringify(result.data, null, 2));
            recordAudit(tenantId, packId, 'pack.bulk_exported', exportRole);
          } catch (err) {
            errors.push({ pack_id: packId, code: err.code || 'ERROR', message: err.message });
          }
        }

        if (Object.keys(files).length === 0) {
          return failResp(res, 'ALL_EXPORTS_FAILED', `All ${packIds.length} pack(s) failed to export`, 422);
        }

        const zipBuf        = buildZip(files);
        const generatedInMs = Date.now() - t0;

        res.writeHead(200, {
          'content-type':        'application/zip',
          'content-disposition': `attachment; filename="evidence_bulk_${Date.now()}.zip"`,
          'cache-control':       'no-store',
          'x-generated-in-ms':   String(generatedInMs),
          'x-error-count':       String(errors.length),
        });
        return res.end(zipBuf);
      }

      // ── GET /api/evidence/audit ──────────────────────────────────────────
      if (method === 'GET' && pathname === '/api/evidence/audit') {
        const entries = auditLog.filter(e => e.tenant_id === tenantId);
        return okResp(res, { entries, count: entries.length });
      }

      return failResp(res, 'NOT_FOUND', 'Evidence route not found', 404);
    } catch (err) {
      const msg = err && err.message ? String(err.message) : 'Unhandled error';
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: msg } }));
    }
  }

  return { handle, store: epStore, svc: epSvc, auditLog };
}

module.exports = { createEvidencePackRouter };
