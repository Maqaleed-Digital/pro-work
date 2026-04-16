'use strict';

/**
 * S38-G6 — PDPL API Router
 *
 * Routes:
 *   GET  /api/compliance/pdpl/dsr                  — list all DSRs (tenant-scoped)
 *   POST /api/compliance/pdpl/dsr                  — submit new DSR
 *   GET  /api/compliance/pdpl/dsr/sla-alerts        — DSRs at/past day-25 alert threshold
 *   GET  /api/compliance/pdpl/dsr/:id               — get DSR with SLA fields
 *   POST /api/compliance/pdpl/dsr/:id/process       — advance DSR status, append action log
 *   GET  /api/compliance/pdpl/lawful-basis          — lawful basis registry
 *   GET  /api/compliance/pdpl/documents/:docType    — download compliance document
 *   GET  /api/compliance/pdpl/coverage              — jurisdiction coverage info
 */

const { createPdplService, InMemoryDsrStore } = require('../modules/compliance/pdpl_service');

function ok(res, data, status = 200) {
  const body = JSON.stringify({ ok: true, data });
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function fail(res, code, message, status = 400) {
  const body = JSON.stringify({ ok: false, error: { code, message } });
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function createPdplRouter({ store, svc } = {}) {
  const pdplStore = store || new InMemoryDsrStore();
  const _hooks = { publish: async () => {} };  // stub hooks — server wires real hooks separately
  const pdplSvc = svc || createPdplService({ store: pdplStore, hooks: _hooks });

  // Match /api/compliance/pdpl/dsr/:id  or  /api/compliance/pdpl/dsr/:id/process
  const DSR_ID_RE        = /^\/api\/compliance\/pdpl\/dsr\/([^/]+)$/;
  const DSR_PROCESS_RE   = /^\/api\/compliance\/pdpl\/dsr\/([^/]+)\/process$/;
  const DOCUMENT_RE      = /^\/api\/compliance\/pdpl\/documents\/([^/]+)$/;

  async function handle(req, res, pathname, method, tenantId, body) {
    try {
      // ── GET /api/compliance/pdpl/coverage ──────────────────────────────────
      if (method === 'GET' && pathname === '/api/compliance/pdpl/coverage') {
        const p = pdplSvc._policies;
        const policy = Object.values(p).sort((a, b) => b.version.localeCompare(a.version))[0];
        return ok(res, { coverage: policy ? policy.coverage : [], version: policy ? policy.version : null });
      }

      // ── GET /api/compliance/pdpl/lawful-basis ──────────────────────────────
      if (method === 'GET' && pathname === '/api/compliance/pdpl/lawful-basis') {
        return ok(res, pdplSvc.getLawfulBasisRegistry());
      }

      // ── GET /api/compliance/pdpl/dsr/sla-alerts  (before :id match) ───────
      if (method === 'GET' && pathname === '/api/compliance/pdpl/dsr/sla-alerts') {
        const alerts = await pdplSvc.checkSlaAlerts(tenantId);
        return ok(res, alerts);
      }

      // ── GET /api/compliance/pdpl/dsr ──────────────────────────────────────
      if (method === 'GET' && pathname === '/api/compliance/pdpl/dsr') {
        const dsrs = await pdplSvc.listDsrs(tenantId);
        return ok(res, dsrs);
      }

      // ── POST /api/compliance/pdpl/dsr ─────────────────────────────────────
      if (method === 'POST' && pathname === '/api/compliance/pdpl/dsr') {
        if (!body) return fail(res, 'BODY_REQUIRED', 'request body is required', 422);
        const dsr = await pdplSvc.submitDsr({ ...body, tenant_id: body.tenant_id || tenantId });
        return ok(res, dsr, 201);
      }

      // ── GET /api/compliance/pdpl/documents/:docType ────────────────────────
      const docMatch = DOCUMENT_RE.exec(pathname);
      if (method === 'GET' && docMatch) {
        const docType   = decodeURIComponent(docMatch[1]);
        const content   = pdplSvc.getDocumentContent(docType);
        if (!content) return fail(res, 'NOT_FOUND', `document not found: ${docType}`, 404);
        const policy    = Object.values(pdplSvc._policies).sort((a, b) => b.version.localeCompare(a.version))[0];
        const doc       = policy ? (policy.documents || []).find(d => d.doc_type === docType) : null;
        const filename  = doc ? doc.filename : `${docType}.txt`;
        res.writeHead(200, {
          'content-type':        'text/plain; charset=utf-8',
          'content-disposition': `attachment; filename="${filename}"`,
          'cache-control':       'no-store',
        });
        return res.end(content);
      }

      // ── POST /api/compliance/pdpl/dsr/:id/process ─────────────────────────
      const processMatch = DSR_PROCESS_RE.exec(pathname);
      if (method === 'POST' && processMatch) {
        const dsrId = decodeURIComponent(processMatch[1]);
        if (!body) return fail(res, 'BODY_REQUIRED', 'request body is required', 422);
        const { action_type, actor_id, notes } = body;
        const updated = await pdplSvc.processDsr(dsrId, action_type, actor_id, notes);
        return ok(res, updated);
      }

      // ── GET /api/compliance/pdpl/dsr/:id ──────────────────────────────────
      const idMatch = DSR_ID_RE.exec(pathname);
      if (method === 'GET' && idMatch) {
        const dsrId = decodeURIComponent(idMatch[1]);
        const dsr   = await pdplSvc.getDsrStatus(dsrId);
        return ok(res, dsr);
      }

      return fail(res, 'NOT_FOUND', `PDPL route not found: ${method} ${pathname}`, 404);
    } catch (e) {
      if (e && e.name === 'PdplServiceError') {
        const status = e.code === 'DSR_NOT_FOUND' ? 404
          : e.code === 'DUPLICATE_DSR' ? 409
          : e.code === 'DSR_TERMINAL'  ? 409
          : 400;
        return fail(res, e.code, e.message, status);
      }
      return fail(res, 'INTERNAL_ERROR', e.message || 'internal error', 500);
    }
  }

  return { handle, store: pdplStore, svc: pdplSvc };
}

module.exports = { createPdplRouter };
