'use strict'

const assert = require('assert')
const { createInvoiceService } = require('../../app/modules/invoices/invoice_service')
const { tenantUuid } = require('../../app/lib/persistence/with_tenant')

/**
 * WO-WC-SEC-02A — GUC-wiring verification for the invoices module.
 *
 * Proves that every invoices / invoice_line_items access path now flows through the
 * consolidated with_tenant helper, i.e.:
 *   - both tenant GUCs (app.current_tenant_id + app.tenant_id) are set TRANSACTION-LOCAL
 *     BEFORE any data query runs (fail-closed: no DB access without tenant context);
 *   - app.tenant_id carries the md5-derived UUID, app.current_tenant_id the raw 'tn-…';
 *   - missing tenant context is rejected before any DB access (no connect, no query).
 *
 * This is a context-wiring test, NOT an RLS-enforcement test — RLS is not FORCEd on
 * these tables yet (GO-1). It asserts the GUC is set, which is necessary-not-sufficient.
 */

// Instrumented mock pg Pool: records every client query (whitespace-normalized) and
// every set_config call, with enough invoices/line_items behavior to drive all 4 ops.
function createInstrumentedPool() {
  const invoices = new Map()
  const lineItems = new Map()
  const log = []        // [{ sql, params }] — order-preserving, across BEGIN..COMMIT
  const setConfig = []  // [{ name, value }]

  function query(sql, params) {
    const norm = String(sql).replace(/\s+/g, ' ').trim()
    log.push({ sql: norm, params })

    if (/set_config/i.test(norm)) {
      const m = norm.match(/set_config\('([^']+)'/i)
      if (m) setConfig.push({ name: m[1], value: params && params[0] })
      return { rows: [{}], rowCount: 1 }
    }
    if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(norm)) return { rows: [], rowCount: 0 }

    if (/INSERT INTO invoices/i.test(norm)) {
      const row = {
        id: params[0], tenant_id: params[1], currency: params[2], subtotal: params[3],
        vat_rate: params[4], vat_amount: params[5], total: params[6], status: 'draft',
        created_by: params[7], issued_by: null, invoice_number: null,
        created_at: new Date().toISOString(), issued_at: null,
      }
      invoices.set(row.id, row)
      return { rows: [{ ...row }], rowCount: 1 }
    }
    if (/INSERT INTO invoice_line_items/i.test(norm)) {
      const row = {
        id: params[0], invoice_id: params[1], description: params[2],
        qty: params[3], unit_amount: params[4], line_total: params[5],
      }
      lineItems.set(row.id, row)
      return { rows: [{ ...row }], rowCount: 1 }
    }
    if (/FROM invoice_line_items WHERE invoice_id/i.test(norm)) {
      const rows = Array.from(lineItems.values())
        .filter(li => li.invoice_id === params[0])
        .map(li => ({ ...li }))
      return { rows, rowCount: rows.length }
    }
    if (/SELECT COUNT\(\*\)/i.test(norm)) {
      const cnt = Array.from(invoices.values())
        .filter(i => i.tenant_id === params[0] && i.invoice_number != null).length
      return { rows: [{ cnt }], rowCount: 1 }
    }
    if (/SELECT \* FROM invoices WHERE id/i.test(norm)) {
      const inv = invoices.get(params[0])
      if (!inv || inv.tenant_id !== params[1]) return { rows: [], rowCount: 0 }
      return { rows: [{ ...inv }], rowCount: 1 }
    }
    if (/UPDATE invoices/i.test(norm) && /status = 'issued'/i.test(norm)) {
      const inv = invoices.get(params[2])
      if (!inv || inv.tenant_id !== params[3]) return { rows: [], rowCount: 0 }
      inv.status = 'issued'; inv.issued_by = params[0]; inv.invoice_number = params[1]
      inv.issued_at = new Date().toISOString()
      return { rows: [{ ...inv }], rowCount: 1 }
    }
    if (/UPDATE invoices/i.test(norm) && /status = 'void'/i.test(norm)) {
      const inv = invoices.get(params[0])
      if (!inv || inv.tenant_id !== params[1]) return { rows: [], rowCount: 0 }
      inv.status = 'void'
      return { rows: [{ ...inv }], rowCount: 1 }
    }
    return { rows: [], rowCount: 0 }
  }

  const client = { query: async (sql, params) => query(sql, params), release() {} }
  return {
    connect: () => Promise.resolve(client),
    query: (sql, params) => Promise.resolve(query(sql, params)),
    _log: log,
    _setConfig: setConfig,
    _invoices: invoices,
    _reset() { log.length = 0; setConfig.length = 0 },
  }
}

const TENANT = 'tn-ctx-7777'

// Assert both GUCs were set for TENANT, before the first data query matching `dataRe`.
function assertGucBefore(pool, dataRe, label) {
  const cur = pool._setConfig.find(s => s.name === 'app.current_tenant_id')
  const uid = pool._setConfig.find(s => s.name === 'app.tenant_id')
  assert.ok(cur, `${label}: app.current_tenant_id must be set`)
  assert.ok(uid, `${label}: app.tenant_id must be set`)
  assert.strictEqual(cur.value, TENANT, `${label}: current_tenant_id value`)
  assert.strictEqual(uid.value, tenantUuid(TENANT), `${label}: tenant_id must be md5-derived UUID`)

  const idxSet = pool._log.findIndex(e => /set_config\('app\.current_tenant_id'/.test(e.sql))
  const idxData = pool._log.findIndex(e => dataRe.test(e.sql))
  assert.ok(idxSet >= 0, `${label}: set_config present in query log`)
  assert.ok(idxData >= 0, `${label}: data query present in query log`)
  assert.ok(idxSet < idxData, `${label}: GUC must be set BEFORE the data query`)
}

async function run() {
  let passed = 0

  // ---- valid tenant context: WRITES set the GUC before any invoices access ----

  // (1) create
  {
    const pool = createInstrumentedPool()
    const svc = createInvoiceService({ pool })
    await svc.createInvoice({ tenantId: TENANT, createdBy: 'u1', lineItems: [{ description: 'X', qty: 1, unit_amount: 10 }] })
    assertGucBefore(pool, /INSERT INTO invoices/, 'create')
    passed++; console.log('  ✓ create: both GUCs set (current_tenant_id + md5 tenant_id) before INSERT INTO invoices')
  }

  // (2) issue
  {
    const pool = createInstrumentedPool()
    const svc = createInvoiceService({ pool })
    const draft = await svc.createInvoice({ tenantId: TENANT, createdBy: 'u1', lineItems: [{ description: 'X', qty: 1, unit_amount: 10 }] })
    pool._reset()
    await svc.issueInvoice({ invoiceId: draft.id, tenantId: TENANT, issuedBy: 'u1' })
    assertGucBefore(pool, /UPDATE invoices/, 'issue')
    passed++; console.log('  ✓ issue: GUC set before SELECT/UPDATE invoices')
  }

  // (3) void
  {
    const pool = createInstrumentedPool()
    const svc = createInvoiceService({ pool })
    const draft = await svc.createInvoice({ tenantId: TENANT, createdBy: 'u1', lineItems: [{ description: 'X', qty: 1, unit_amount: 10 }] })
    pool._reset()
    await svc.voidInvoice({ invoiceId: draft.id, tenantId: TENANT })
    assertGucBefore(pool, /UPDATE invoices/, 'void')
    passed++; console.log('  ✓ void: GUC set before UPDATE invoices')
  }

  // ---- valid tenant context: READ sets the GUC before invoices + line_items reads ----

  // (4) get → invoices read under GUC
  {
    const pool = createInstrumentedPool()
    const svc = createInvoiceService({ pool })
    const draft = await svc.createInvoice({ tenantId: TENANT, createdBy: 'u1', lineItems: [{ description: 'X', qty: 1, unit_amount: 10 }] })
    pool._reset()
    await svc.getInvoice({ invoiceId: draft.id, tenantId: TENANT })
    assertGucBefore(pool, /SELECT \* FROM invoices WHERE id/, 'get')
    passed++; console.log('  ✓ get (invoice read): GUC set before SELECT * FROM invoices')
  }

  // (5) get → invoice_line_items read happens within tenant context
  {
    const pool = createInstrumentedPool()
    const svc = createInvoiceService({ pool })
    const draft = await svc.createInvoice({ tenantId: TENANT, createdBy: 'u1', lineItems: [{ description: 'X', qty: 1, unit_amount: 10 }] })
    pool._reset()
    await svc.getInvoice({ invoiceId: draft.id, tenantId: TENANT })
    assertGucBefore(pool, /FROM invoice_line_items WHERE invoice_id/, 'get-line-items')
    passed++; console.log('  ✓ get (line_items read): GUC set before FROM invoice_line_items')
  }

  // ---- missing tenant context: rejected BEFORE any DB access (fail-closed) ----

  // (6) every op throws 422 and performs ZERO DB access when tenantId is absent
  {
    const ops = [
      ['createInvoice', svc => svc.createInvoice({ lineItems: [{ description: 'X', qty: 1, unit_amount: 1 }] })],
      ['issueInvoice',  svc => svc.issueInvoice({ invoiceId: 'i-1' })],
      ['voidInvoice',   svc => svc.voidInvoice({ invoiceId: 'i-1' })],
      ['getInvoice',    svc => svc.getInvoice({ invoiceId: 'i-1' })],
    ]
    for (const [name, fn] of ops) {
      const pool = createInstrumentedPool()
      const svc = createInvoiceService({ pool })
      let threw = null
      try { await fn(svc) } catch (e) { threw = e }
      assert.ok(threw, `${name}: must throw without tenant context`)
      assert.strictEqual(threw.status, 422, `${name}: missing tenant → 422`)
      assert.strictEqual(pool._log.length, 0, `${name}: NO DB access before tenant context (got ${pool._log.length} queries)`)
      assert.strictEqual(pool._setConfig.length, 0, `${name}: no set_config without tenant`)
    }
    passed++; console.log('  ✓ missing tenant context: create/issue/void/get all → 422 with ZERO DB access (fail-closed)')
  }

  console.log(`  invoice_tenant_context: ${passed}/6 passed`)
  return passed
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p === 6 ? 0 : 1)).catch(e => { console.error(e); process.exit(1) })
}
