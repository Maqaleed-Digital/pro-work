'use strict'

const assert = require('assert')
const { createInvoiceService } = require('../../app/modules/invoices/invoice_service')
const { createInvoiceRouter }  = require('../../app/api/invoice_router')

/**
 * WC-06: transaction-aware mock pg Pool for invoices + invoice_line_items.
 *
 * Mirrors the auth_router.test.js pattern:
 *   BEGIN    → snapshot backing maps (deep copy)
 *   ROLLBACK → restore from snapshot
 *   COMMIT   → discard snapshot (keep mutations)
 * Shared backing maps are used by both pool.query and the client returned by
 * pool.connect(), so a transaction sees its own uncommitted writes.
 */
function createMockPool() {
  const invoices  = new Map()  // id → row
  const lineItems = new Map()  // id → row

  const state = { snapshot: null, failNextNumberUpdate: false }

  function snapshot() {
    state.snapshot = {
      invoices:  new Map(Array.from(invoices.entries()).map(([k, v]) => [k, { ...v }])),
      lineItems: new Map(Array.from(lineItems.entries()).map(([k, v]) => [k, { ...v }])),
    }
  }
  function restore() {
    if (!state.snapshot) return
    invoices.clear();  for (const [k, v] of state.snapshot.invoices)  invoices.set(k, v)
    lineItems.clear(); for (const [k, v] of state.snapshot.lineItems) lineItems.set(k, v)
    state.snapshot = null
  }

  function query(sql, params) {
    if (/^BEGIN/i.test(sql))    { snapshot(); return { rows: [], rowCount: 0 } }
    if (/^ROLLBACK/i.test(sql)) { restore();  return { rows: [], rowCount: 0 } }
    if (/^COMMIT/i.test(sql))   { state.snapshot = null; return { rows: [], rowCount: 0 } }

    // INSERT INTO invoices (... ) RETURNING *
    if (/INSERT INTO invoices/i.test(sql)) {
      const row = {
        id: params[0], tenant_id: params[1], currency: params[2],
        subtotal: params[3], vat_rate: params[4], vat_amount: params[5],
        total: params[6], status: 'draft', created_by: params[7],
        issued_by: null, invoice_number: null,
        created_at: new Date().toISOString(), issued_at: null,
      }
      invoices.set(row.id, row)
      return { rows: [{ ...row }], rowCount: 1 }
    }

    // INSERT INTO invoice_line_items
    if (/INSERT INTO invoice_line_items/i.test(sql)) {
      const row = {
        id: params[0], invoice_id: params[1], description: params[2],
        qty: params[3], unit_amount: params[4], line_total: params[5],
      }
      lineItems.set(row.id, row)
      return { rows: [{ ...row }], rowCount: 1 }
    }

    // SELECT ... FROM invoice_line_items WHERE invoice_id
    if (/FROM invoice_line_items WHERE invoice_id/i.test(sql)) {
      const rows = Array.from(lineItems.values())
        .filter(li => li.invoice_id === params[0])
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map(li => ({ ...li }))
      return { rows, rowCount: rows.length }
    }

    // SELECT COUNT(*) FROM invoices WHERE tenant_id AND invoice_number IS NOT NULL
    if (/SELECT COUNT\(\*\)/i.test(sql) && /invoice_number IS NOT NULL/i.test(sql)) {
      const cnt = Array.from(invoices.values())
        .filter(inv => inv.tenant_id === params[0] && inv.invoice_number != null).length
      return { rows: [{ cnt }], rowCount: 1 }
    }

    // SELECT * FROM invoices WHERE id AND tenant_id (FOR UPDATE or plain)
    if (/SELECT \* FROM invoices WHERE id/i.test(sql)) {
      const inv = invoices.get(params[0])
      if (!inv || inv.tenant_id !== params[1]) return { rows: [], rowCount: 0 }
      return { rows: [{ ...inv }], rowCount: 1 }
    }

    // UPDATE invoices SET status='issued' ... RETURNING *
    if (/UPDATE invoices/i.test(sql) && /status = 'issued'/i.test(sql)) {
      if (state.failNextNumberUpdate) {
        state.failNextNumberUpdate = false
        throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' })
      }
      // params: [issuedBy, invoiceNumber, invoiceId, tenantId]
      const inv = invoices.get(params[2])
      if (!inv || inv.tenant_id !== params[3]) return { rows: [], rowCount: 0 }
      // Enforce the UNIQUE(invoice_number) constraint.
      for (const other of invoices.values()) {
        if (other.id !== inv.id && other.invoice_number === params[1]) {
          throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' })
        }
      }
      inv.status = 'issued'
      inv.issued_at = new Date().toISOString()
      inv.issued_by = params[0]
      inv.invoice_number = params[1]
      return { rows: [{ ...inv }], rowCount: 1 }
    }

    // UPDATE invoices SET status='void' ... RETURNING *
    if (/UPDATE invoices/i.test(sql) && /status = 'void'/i.test(sql)) {
      const inv = invoices.get(params[0])
      if (!inv || inv.tenant_id !== params[1]) return { rows: [], rowCount: 0 }
      inv.status = 'void'
      return { rows: [{ ...inv }], rowCount: 1 }
    }

    return { rows: [], rowCount: 0 }
  }

  const mockClient = { query: async (sql, params) => query(sql, params), release() {} }

  const pool = {
    connect() { return Promise.resolve(mockClient) },
    query(sql, params) { return Promise.resolve(query(sql, params)) },
    _invoices: invoices,
    _lineItems: lineItems,
  }
  Object.defineProperty(pool, 'failNextNumberUpdate', {
    get() { return state.failNextNumberUpdate },
    set(v) { state.failNextNumberUpdate = v },
  })
  return pool
}

function createMockRes() {
  let _status = 200
  let _body = ''
  return {
    writeHead(s) { _status = s },
    end(b) { _body = b || '' },
    get status() { return _status },
    get body() { return _body ? JSON.parse(_body) : null },
  }
}

const USER_A = { id: 'user-a', tenant_id: 'tn-aaaa1111', role: 'OWNER' }
const USER_B = { id: 'user-b', tenant_id: 'tn-bbbb2222', role: 'OWNER' }

async function run() {
  let passed = 0
  const pool = createMockPool()
  const service = createInvoiceService({ pool })
  const router = createInvoiceRouter({ invoiceService: service })

  async function call(method, pathname, body, user) {
    const res = createMockRes()
    await router.handle({ method, url: pathname, headers: {} }, res, pathname, method, body, user)
    return res
  }

  // (a) create draft → status=draft, tenant linked, totals computed from input
  let draftId
  {
    const res = await call('POST', '/api/invoices', {
      lineItems: [
        { description: 'Placement fee', qty: 2, unit_amount: 100 },
        { description: 'Onboarding',    qty: 1, unit_amount: 50 },
      ],
    }, USER_A)
    assert.strictEqual(res.status, 201)
    const inv = res.body.data
    assert.strictEqual(inv.status, 'draft')
    assert.strictEqual(inv.tenant_id, USER_A.tenant_id)
    assert.strictEqual(inv.invoice_number, null)
    assert.strictEqual(inv.subtotal, 250)        // 2*100 + 1*50
    assert.strictEqual(inv.vat_rate, 0.15)       // config default
    assert.strictEqual(inv.vat_amount, 37.5)     // 250 * 0.15
    assert.strictEqual(inv.total, 287.5)
    assert.strictEqual(inv.line_items.length, 2)
    const lineTotals = inv.line_items.map(li => li.line_total).sort((a, b) => a - b)
    assert.deepStrictEqual(lineTotals, [50, 200])
    draftId = inv.id
    passed++
    console.log('  ✓ create draft persists status=draft, tenant linked, totals computed from input')
  }

  // (b) issue draft → status=issued, issued_at set, invoice_number assigned + scheme correct
  {
    const res = await call('POST', `/api/invoices/${draftId}/issue`, null, USER_A)
    assert.strictEqual(res.status, 200)
    const inv = res.body.data
    assert.strictEqual(inv.status, 'issued')
    assert.ok(inv.issued_at, 'issued_at should be set')
    assert.strictEqual(inv.issued_by, USER_A.id)
    assert.ok(/^INV-[A-Z0-9]+-0001$/.test(inv.invoice_number), `bad scheme: ${inv.invoice_number}`)
    passed++
    console.log(`  ✓ issue draft → status=issued, issued_at set, invoice_number=${inv.invoice_number}`)
  }

  // (b2) second issued invoice for same tenant gets sequential number 0002
  {
    const created = await call('POST', '/api/invoices', {
      lineItems: [{ description: 'Second', qty: 1, unit_amount: 10 }],
    }, USER_A)
    const id2 = created.body.data.id
    const res = await call('POST', `/api/invoices/${id2}/issue`, null, USER_A)
    assert.strictEqual(res.status, 200)
    assert.ok(/^INV-[A-Z0-9]+-0002$/.test(res.body.data.invoice_number), `bad seq: ${res.body.data.invoice_number}`)
    passed++
    console.log(`  ✓ per-tenant sequential numbering → ${res.body.data.invoice_number}`)
  }

  // (c) issue a non-draft (already issued) → 409, NO state change
  {
    const before = pool._invoices.get(draftId)
    const beforeNumber = before.invoice_number
    const beforeStatus = before.status
    const res = await call('POST', `/api/invoices/${draftId}/issue`, null, USER_A)
    assert.strictEqual(res.status, 409)
    assert.ok(/not in draft/i.test(res.body.error.message))
    const after = pool._invoices.get(draftId)
    assert.strictEqual(after.status, beforeStatus)
    assert.strictEqual(after.invoice_number, beforeNumber)
    passed++
    console.log('  ✓ issue already-issued invoice → 409, no state change')
  }

  // (d) void → status=void
  {
    const res = await call('POST', `/api/invoices/${draftId}/void`, null, USER_A)
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.data.status, 'void')
    passed++
    console.log('  ✓ void → status=void')
  }

  // (c2) issue a voided invoice → 409, NO state change
  {
    const before = { ...pool._invoices.get(draftId) }
    const res = await call('POST', `/api/invoices/${draftId}/issue`, null, USER_A)
    assert.strictEqual(res.status, 409)
    const after = pool._invoices.get(draftId)
    assert.strictEqual(after.status, before.status)         // still void
    assert.strictEqual(after.invoice_number, before.invoice_number)
    passed++
    console.log('  ✓ issue voided invoice → 409, no state change')
  }

  // (e) amount + VAT come from input/config — vatRate=0 → vat_amount=0 (no hard-coded price)
  {
    const res = await call('POST', '/api/invoices', {
      lineItems: [{ description: 'Custom', qty: 3, unit_amount: 7 }],
      currency: 'USD',
      vatRate: 0,
    }, USER_A)
    assert.strictEqual(res.status, 201)
    const inv = res.body.data
    assert.strictEqual(inv.subtotal, 21)       // 3*7, straight from input
    assert.strictEqual(inv.vat_rate, 0)        // overridden per-request
    assert.strictEqual(inv.vat_amount, 0)
    assert.strictEqual(inv.total, 21)
    assert.strictEqual(inv.currency, 'USD')    // currency from input
    passed++
    console.log('  ✓ amount + VAT from input/config (vatRate=0 → vat_amount=0); no hard-coded price')
  }

  // (e2) per-request vatRate override is applied (e.g. 0.05)
  {
    const res = await call('POST', '/api/invoices', {
      lineItems: [{ description: 'Item', qty: 1, unit_amount: 200 }],
      vatRate: 0.05,
    }, USER_A)
    const inv = res.body.data
    assert.strictEqual(inv.vat_rate, 0.05)
    assert.strictEqual(inv.vat_amount, 10)     // 200 * 0.05
    assert.strictEqual(inv.total, 210)
    passed++
    console.log('  ✓ per-request vatRate override applied (0.05 → vat_amount=10)')
  }

  // create-validation: empty line items → 422
  {
    const res = await call('POST', '/api/invoices', { lineItems: [] }, USER_A)
    assert.strictEqual(res.status, 422)
    passed++
    console.log('  ✓ create rejects empty line items → 422')
  }

  // (f) cross-tenant isolation — tenant B cannot GET or ISSUE tenant A's invoice
  {
    // tenant A creates a fresh draft
    const created = await call('POST', '/api/invoices', {
      lineItems: [{ description: 'A-only', qty: 1, unit_amount: 100 }],
    }, USER_A)
    const aId = created.body.data.id

    const getRes = await call('GET', `/api/invoices/${aId}`, null, USER_B)
    assert.strictEqual(getRes.status, 404)

    const issueRes = await call('POST', `/api/invoices/${aId}/issue`, null, USER_B)
    assert.strictEqual(issueRes.status, 404)

    // confirm tenant A's invoice was NOT touched by B's attempt
    const aStill = pool._invoices.get(aId)
    assert.strictEqual(aStill.status, 'draft')
    assert.strictEqual(aStill.invoice_number, null)

    // tenant A can still get its own
    const aGet = await call('GET', `/api/invoices/${aId}`, null, USER_A)
    assert.strictEqual(aGet.status, 200)
    passed++
    console.log('  ✓ cross-tenant isolation: tenant B cannot get/issue tenant A invoice (404)')
  }

  // auth boundary: unauthenticated → 401
  {
    const res = await call('POST', '/api/invoices', { lineItems: [{ description: 'x', qty: 1, unit_amount: 1 }] }, null)
    assert.strictEqual(res.status, 401)
    passed++
    console.log('  ✓ unauthenticated request → 401')
  }

  // GET unknown invoice → 404
  {
    const res = await call('GET', '/api/invoices/does-not-exist', null, USER_A)
    assert.strictEqual(res.status, 404)
    passed++
    console.log('  ✓ get unknown invoice → 404')
  }

  // retry-once on invoice_number UNIQUE collision — first UPDATE throws 23505,
  // service retries the transaction and succeeds.
  {
    const created = await call('POST', '/api/invoices', {
      lineItems: [{ description: 'Retry', qty: 1, unit_amount: 5 }],
    }, USER_A)
    const id = created.body.data.id
    pool.failNextNumberUpdate = true
    const res = await call('POST', `/api/invoices/${id}/issue`, null, USER_A)
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.data.status, 'issued')
    assert.ok(/^INV-[A-Z0-9]+-\d{4}$/.test(res.body.data.invoice_number))
    passed++
    console.log('  ✓ issue retries once on invoice_number UNIQUE collision → succeeds')
  }

  console.log(`  invoice_router: ${passed}/13 passed`)
  return passed
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p === 13 ? 0 : 1))
}
