'use strict';

/**
 * S38-G3 — Trust & Evidence Control Screen API Tests
 *
 * Tests the evidence_pack_router HTTP handler directly (no HTTP server needed).
 * Covers: list, get (integrity), export (JSON + ZIP), bulk-export, audit trail,
 * tenant isolation, OPEN-pack export rejection, and SLA ≤60s timing test.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('stream');

const { createEvidencePackRouter } = require('../app/api/evidence_pack_router');
const { InMemoryEvidencePackStore, createEvidencePackService } = require('../app/modules/evidence/evidence_pack_service');

// ── test harness ──────────────────────────────────────────────────────────────

/**
 * Minimal fake req/res pair — enough for the router's handle() to work.
 * Captures writeHead calls and end() payload.
 */
function makePair({ method = 'GET', headers = {}, pathname = '/' } = {}) {
  const res = {
    _status:  null,
    _headers: {},
    _body:    null,
    _chunks:  [],
    writeHead(status, hdrs) { this._status = status; Object.assign(this._headers, hdrs || {}) },
    end(data)  { this._body = data; return this },
    getJson()  { return JSON.parse(this._body) },
    isZip()    { return this._headers['content-type'] === 'application/zip' },
  }
  const req = {
    method,
    headers: { 'x-tenant-id': 'tenant-test', ...headers },
  }
  return { req, res, pathname }
}

/**
 * build a ready-to-use router with a pre-seeded store.
 * Returns { router, svc, store, seedPack }
 */
async function buildRouter() {
  const store = new InMemoryEvidencePackStore();
  const svc   = createEvidencePackService({ store });
  const router = createEvidencePackRouter({ store, svc });
  return { router, svc, store };
}

function basePackParams(overrides = {}) {
  return {
    pack_id:         'pk-001',
    pack_type:       'EP_WOS_HIRE_01',
    tenant_id:       'tenant-test',
    actor:           { actor_id: 'u1', actor_name: 'Alice', actor_role: 'HR' },
    action:          'Contract signed for wrk-1',
    timestamp:       '2026-04-16T10:00:00.000Z',
    data_snapshot:   { contract_id: 'c1', salary: 8000, national_id: 'SA9999' },
    attached_files:  [],
    approval_chain:  [],
    ai_artifacts:    [],
    redaction_rules: [],
    ...overrides,
  };
}

// ── 1. list packs ─────────────────────────────────────────────────────────────

describe('GET /api/evidence/packs — list', () => {
  test('returns empty list when no packs exist', async () => {
    const { router } = await buildRouter();
    const { req, res, pathname } = makePair({ pathname: '/api/evidence/packs' });
    await router.handle(req, res, pathname, 'GET', 'tenant-test', null);
    assert.equal(res._status, 200);
    const data = res.getJson();
    assert.ok(data.ok);
    assert.equal(data.data.count, 0);
  });

  test('returns packs for correct tenant only', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams({ pack_id: 'pk-A', tenant_id: 'tenant-test' }));
    await svc.create(basePackParams({ pack_id: 'pk-B', tenant_id: 'tenant-other' }));

    const { req, res, pathname } = makePair({ pathname: '/api/evidence/packs' });
    await router.handle(req, res, pathname, 'GET', 'tenant-test', null);
    const data = res.getJson();
    assert.equal(data.data.count, 1);
    assert.equal(data.data.packs[0].pack_id, 'pk-A');
  });

  test('records audit event on list', async () => {
    const { router, auditLog } = await buildRouter();
    const { req, res, pathname } = makePair({ pathname: '/api/evidence/packs' });
    await router.handle(req, res, pathname, 'GET', 'tenant-test', null);
    assert.equal(router.auditLog.filter(e => e.event === 'packs.listed').length, 1);
  });
});

// ── 2. get pack — integrity ───────────────────────────────────────────────────

describe('GET /api/evidence/packs/:id — get + integrity', () => {
  test('returns 200 with integrity: VERIFIED for untampered pack', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams());

    const { req, res, pathname } = makePair({ pathname: '/api/evidence/packs/pk-001' });
    await router.handle(req, res, pathname, 'GET', 'tenant-test', null);
    const data = res.getJson();
    assert.equal(res._status, 200);
    assert.ok(data.ok);
    assert.equal(data.data.integrity, 'VERIFIED');
  });

  test('returns 409 INTEGRITY_VIOLATION for tampered pack', async () => {
    const { router, svc, store } = await buildRouter();
    await svc.create(basePackParams());

    // Tamper directly in the store
    const internal = store._packs.get('pk-001');
    internal.data_snapshot = { tampered: true };

    const { req, res, pathname } = makePair({ pathname: '/api/evidence/packs/pk-001' });
    await router.handle(req, res, pathname, 'GET', 'tenant-test', null);
    assert.equal(res._status, 409);
    const data = res.getJson();
    assert.equal(data.error.code, 'INTEGRITY_VIOLATION');
    assert.ok(data.error.message.includes('integrity violation'));
  });

  test('returns 404 for unknown pack', async () => {
    const { router } = await buildRouter();
    const { req, res, pathname } = makePair({ pathname: '/api/evidence/packs/no-such-pack' });
    await router.handle(req, res, pathname, 'GET', 'tenant-test', null);
    assert.equal(res._status, 404);
    assert.equal(res.getJson().error.code, 'PACK_NOT_FOUND');
  });

  test('returns 403 for cross-tenant access', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams({ tenant_id: 'tenant-A' }));

    const { req, res, pathname } = makePair({ pathname: '/api/evidence/packs/pk-001' });
    await router.handle(req, res, pathname, 'GET', 'tenant-B', null);
    assert.equal(res._status, 403);
    assert.equal(res.getJson().error.code, 'TENANT_MISMATCH');
  });

  test('redacts national_id for VIEWER role', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams());

    const { req, res, pathname } = makePair({
      pathname: '/api/evidence/packs/pk-001',
      headers:  { 'x-requesting-role': 'VIEWER' },
    });
    await router.handle(req, res, pathname, 'GET', 'tenant-test', null);
    const data = res.getJson();
    assert.equal(data.data.pack.data_snapshot.national_id, '[REDACTED]');
    assert.equal(data.data.pack.data_snapshot.salary, '[REDACTED]');
  });

  test('HR role can see national_id and salary', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams());

    const { req, res, pathname } = makePair({
      pathname: '/api/evidence/packs/pk-001',
      headers:  { 'x-requesting-role': 'HR' },
    });
    await router.handle(req, res, pathname, 'GET', 'tenant-test', null);
    const data = res.getJson();
    assert.equal(data.data.pack.data_snapshot.national_id, 'SA9999');
    assert.equal(data.data.pack.data_snapshot.salary, 8000);
  });
});

// ── 3. export single pack ─────────────────────────────────────────────────────

describe('POST /api/evidence/packs/:id/export — single export', () => {
  test('cannot export OPEN pack — 422 PACK_NOT_CLOSED', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams());

    const { req, res, pathname } = makePair({ method: 'POST', pathname: '/api/evidence/packs/pk-001/export' });
    await router.handle(req, res, pathname, 'POST', 'tenant-test', { format: 'JSON' });
    assert.equal(res._status, 422);
    assert.equal(res.getJson().error.code, 'PACK_NOT_CLOSED');
  });

  test('exports CLOSED pack as JSON — returns generated_in_ms', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams());
    await svc.close('pk-001', 'tenant-test', 'hr-user');

    const { req, res, pathname } = makePair({ method: 'POST', pathname: '/api/evidence/packs/pk-001/export' });
    await router.handle(req, res, pathname, 'POST', 'tenant-test', { format: 'JSON', requestingRole: 'HR' });
    assert.equal(res._status, 200);
    const data = res.getJson();
    assert.ok(data.ok);
    assert.ok(typeof data.data.generated_in_ms === 'number');
    assert.equal(data.data.pack_id, 'pk-001');
    assert.equal(data.data.format, 'JSON');
  });

  test('exports CLOSED pack as ZIP — returns zip bytes', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams());
    await svc.close('pk-001', 'tenant-test', 'hr-user');

    const { req, res, pathname } = makePair({ method: 'POST', pathname: '/api/evidence/packs/pk-001/export' });
    // Capture binary response
    let zipBuf = null;
    res.end = (data) => { zipBuf = data; res._body = data; };

    await router.handle(req, res, pathname, 'POST', 'tenant-test', { format: 'ZIP' });
    assert.equal(res._status, 200);
    assert.ok(res.isZip());
    assert.ok(Buffer.isBuffer(zipBuf));
    // ZIP magic bytes: PK\x03\x04
    assert.equal(zipBuf[0], 0x50);
    assert.equal(zipBuf[1], 0x4b);
  });

  test('rejects unsupported format — 400 INVALID_FORMAT', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams());
    await svc.close('pk-001', 'tenant-test', 'hr-user');

    const { req, res, pathname } = makePair({ method: 'POST', pathname: '/api/evidence/packs/pk-001/export' });
    await router.handle(req, res, pathname, 'POST', 'tenant-test', { format: 'XML' });
    assert.equal(res._status, 400);
    assert.equal(res.getJson().error.code, 'INVALID_FORMAT');
  });

  test('export logs audit event', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams());
    await svc.close('pk-001', 'tenant-test', 'hr-user');

    const { req, res, pathname } = makePair({ method: 'POST', pathname: '/api/evidence/packs/pk-001/export' });
    await router.handle(req, res, pathname, 'POST', 'tenant-test', { format: 'JSON' });

    const exportEvents = router.auditLog.filter(e => e.event === 'pack.exported.JSON');
    assert.equal(exportEvents.length, 1);
    assert.equal(exportEvents[0].pack_id, 'pk-001');
  });
});

// ── 4. bulk export ────────────────────────────────────────────────────────────

describe('POST /api/evidence/bulk-export', () => {
  test('rejects empty pack_ids — 400', async () => {
    const { router } = await buildRouter();
    const { req, res, pathname } = makePair({ method: 'POST', pathname: '/api/evidence/bulk-export' });
    await router.handle(req, res, pathname, 'POST', 'tenant-test', { pack_ids: [] });
    assert.equal(res._status, 400);
    assert.equal(res.getJson().error.code, 'NO_PACKS_SELECTED');
  });

  test('bulk exports multiple CLOSED packs as ZIP', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams({ pack_id: 'pk-001' }));
    await svc.create(basePackParams({ pack_id: 'pk-002' }));
    await svc.close('pk-001', 'tenant-test', 'hr-user');
    await svc.close('pk-002', 'tenant-test', 'hr-user');

    const { req, res, pathname } = makePair({ method: 'POST', pathname: '/api/evidence/bulk-export' });
    let zipBuf = null;
    res.end = (data) => { zipBuf = data; res._body = data; };

    await router.handle(req, res, pathname, 'POST', 'tenant-test', { pack_ids: ['pk-001', 'pk-002'] });
    assert.equal(res._status, 200);
    assert.ok(res.isZip());
    assert.ok(Buffer.isBuffer(zipBuf));
    assert.equal(zipBuf[0], 0x50);  // ZIP magic PK
    assert.equal(zipBuf[1], 0x4b);
    assert.equal(res._headers['x-error-count'], '0');
  });

  test('bulk export returns 422 when ALL packs fail (e.g. all OPEN)', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams({ pack_id: 'pk-open-1' }));

    const { req, res, pathname } = makePair({ method: 'POST', pathname: '/api/evidence/bulk-export' });
    await router.handle(req, res, pathname, 'POST', 'tenant-test', { pack_ids: ['pk-open-1'] });
    assert.equal(res._status, 422);
    assert.equal(res.getJson().error.code, 'ALL_EXPORTS_FAILED');
  });
});

// ── 5. audit trail ────────────────────────────────────────────────────────────

describe('GET /api/evidence/audit', () => {
  test('audit trail grows after pack access', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams());

    // List packs
    const { req: r1, res: res1 } = makePair({ pathname: '/api/evidence/packs' });
    await router.handle(r1, res1, '/api/evidence/packs', 'GET', 'tenant-test', null);

    // View pack
    const { req: r2, res: res2 } = makePair({ pathname: '/api/evidence/packs/pk-001' });
    await router.handle(r2, res2, '/api/evidence/packs/pk-001', 'GET', 'tenant-test', null);

    // Fetch audit
    const { req: r3, res: res3 } = makePair({ pathname: '/api/evidence/audit' });
    await router.handle(r3, res3, '/api/evidence/audit', 'GET', 'tenant-test', null);

    const data = res3.getJson();
    assert.ok(data.ok);
    assert.ok(data.data.count >= 2);
    const events = data.data.entries.map(e => e.event);
    assert.ok(events.includes('packs.listed'));
    assert.ok(events.includes('pack.viewed'));
  });

  test('audit trail is tenant-isolated', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams({ tenant_id: 'tenant-X' }));

    // Access from tenant-X
    const { req: r1, res: res1 } = makePair({ pathname: '/api/evidence/packs' });
    await router.handle(r1, res1, '/api/evidence/packs', 'GET', 'tenant-X', null);

    // Audit for tenant-Y should be empty
    const { req: r2, res: res2 } = makePair({ pathname: '/api/evidence/audit' });
    await router.handle(r2, res2, '/api/evidence/audit', 'GET', 'tenant-Y', null);

    const data = res2.getJson();
    assert.equal(data.data.count, 0);
  });
});

// ── 6. SLA timing test ────────────────────────────────────────────────────────

describe('Export SLA ≤60,000ms', () => {
  test('single-pack JSON export completes within 60,000ms', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams());
    await svc.close('pk-001', 'tenant-test', 'hr-user');

    const t0 = Date.now();
    const { req, res, pathname } = makePair({ method: 'POST', pathname: '/api/evidence/packs/pk-001/export' });
    await router.handle(req, res, pathname, 'POST', 'tenant-test', { format: 'JSON' });
    const elapsed = Date.now() - t0;

    assert.equal(res._status, 200, `Export failed with status ${res._status}`);
    assert.ok(elapsed < 60_000, `Export took ${elapsed}ms — exceeded 60,000ms SLA`);

    const data = res.getJson();
    assert.ok(data.data.generated_in_ms < 60_000, `Server reported ${data.data.generated_in_ms}ms — exceeded SLA`);
  });

  test('single-pack ZIP export completes within 60,000ms', async () => {
    const { router, svc } = await buildRouter();
    await svc.create(basePackParams());
    await svc.close('pk-001', 'tenant-test', 'hr-user');

    const t0 = Date.now();
    const { req, res, pathname } = makePair({ method: 'POST', pathname: '/api/evidence/packs/pk-001/export' });
    res.end = (data) => { res._body = data; };

    await router.handle(req, res, pathname, 'POST', 'tenant-test', { format: 'ZIP' });
    const elapsed = Date.now() - t0;

    assert.equal(res._status, 200);
    assert.ok(elapsed < 60_000, `ZIP export took ${elapsed}ms — exceeded 60,000ms SLA`);

    const generatedInMs = Number(res._headers['x-generated-in-ms'] || 0);
    assert.ok(generatedInMs < 60_000, `Server reported ${generatedInMs}ms — exceeded SLA`);
  });

  test('bulk export of 5 packs completes within 60,000ms', async () => {
    const { router, svc } = await buildRouter();
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const id = `pk-bulk-${i}`;
      ids.push(id);
      await svc.create(basePackParams({ pack_id: id }));
      await svc.close(id, 'tenant-test', 'hr-user');
    }

    const t0 = Date.now();
    const { req, res, pathname } = makePair({ method: 'POST', pathname: '/api/evidence/bulk-export' });
    res.end = (data) => { res._body = data; };

    await router.handle(req, res, pathname, 'POST', 'tenant-test', { pack_ids: ids });
    const elapsed = Date.now() - t0;

    assert.equal(res._status, 200);
    assert.ok(elapsed < 60_000, `Bulk export of 5 packs took ${elapsed}ms — exceeded 60,000ms SLA`);
  });
});
