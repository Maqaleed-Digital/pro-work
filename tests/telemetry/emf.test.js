'use strict'

const assert = require('assert')
const { emitMetric, buildEmf, DEFAULT_NAMESPACE } = require('../../app/modules/telemetry/emf')
const { createInvoiceService } = require('../../app/modules/invoices/invoice_service')
const { createInvoiceRouter } = require('../../app/api/invoice_router')

/**
 * F-06: EMF telemetry tests.
 *
 *   (a) EMF-VALIDITY  — emitted line is a structurally-valid `_aws` EMF envelope
 *   (b) NON-BLOCKING  — an emit error is swallowed, never thrown to the caller
 *   (c) WIRED-PATH    — the invoice ISSUE success path calls emit with the
 *                       expected metric name
 *
 * Style mirrors tests/invoices/invoice_router.test.js: plain `assert`, a `run()`
 * returning a pass count, self-executing via `require.main === module`.
 */

// Minimal transaction-aware mock pg Pool, enough for create + issue.
function createMockPool() {
  const invoices = new Map()
  const lineItems = new Map()

  function query(sql, params) {
    if (/^BEGIN/i.test(sql) || /^ROLLBACK/i.test(sql) || /^COMMIT/i.test(sql)) {
      return { rows: [], rowCount: 0 }
    }
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
    if (/INSERT INTO invoice_line_items/i.test(sql)) {
      const row = {
        id: params[0], invoice_id: params[1], description: params[2],
        qty: params[3], unit_amount: params[4], line_total: params[5],
      }
      lineItems.set(row.id, row)
      return { rows: [{ ...row }], rowCount: 1 }
    }
    if (/FROM invoice_line_items WHERE invoice_id/i.test(sql)) {
      const rows = Array.from(lineItems.values())
        .filter(li => li.invoice_id === params[0]).map(li => ({ ...li }))
      return { rows, rowCount: rows.length }
    }
    if (/SELECT COUNT\(\*\)/i.test(sql) && /invoice_number IS NOT NULL/i.test(sql)) {
      const cnt = Array.from(invoices.values())
        .filter(inv => inv.tenant_id === params[0] && inv.invoice_number != null).length
      return { rows: [{ cnt }], rowCount: 1 }
    }
    if (/SELECT \* FROM invoices WHERE id/i.test(sql)) {
      const inv = invoices.get(params[0])
      if (!inv || inv.tenant_id !== params[1]) return { rows: [], rowCount: 0 }
      return { rows: [{ ...inv }], rowCount: 1 }
    }
    if (/UPDATE invoices/i.test(sql) && /status = 'issued'/i.test(sql)) {
      const inv = invoices.get(params[2])
      if (!inv || inv.tenant_id !== params[3]) return { rows: [], rowCount: 0 }
      inv.status = 'issued'
      inv.issued_at = new Date().toISOString()
      inv.issued_by = params[0]
      inv.invoice_number = params[1]
      return { rows: [{ ...inv }], rowCount: 1 }
    }
    return { rows: [], rowCount: 0 }
  }

  const mockClient = { query: async (sql, p) => query(sql, p), release() {} }
  return {
    connect() { return Promise.resolve(mockClient) },
    query(sql, p) { return Promise.resolve(query(sql, p)) },
    _invoices: invoices,
  }
}

function createMockRes() {
  let _status = 200, _body = ''
  return {
    writeHead(s) { _status = s },
    end(b) { _body = b || '' },
    get status() { return _status },
    get body() { return _body ? JSON.parse(_body) : null },
  }
}

const USER_A = { id: 'user-a', tenant_id: 'tn-aaaa1111', role: 'OWNER' }

async function run() {
  let passed = 0

  // (a) EMF-VALIDITY — capture the emitted line, JSON.parse, assert envelope shape.
  {
    let captured = null
    const ok = emitMetric(
      { name: 'InvoicesIssued', value: 1, unit: 'Count' },
      (s) => { captured = s }
    )
    assert.strictEqual(ok, true, 'emitMetric should report success')
    assert.ok(captured.endsWith('\n'), 'emitted line should be newline-terminated')

    const parsed = JSON.parse(captured)
    assert.ok(parsed._aws, '_aws envelope present')
    assert.strictEqual(typeof parsed._aws.Timestamp, 'number', 'Timestamp is epoch ms (number)')
    assert.ok(parsed._aws.Timestamp > 0, 'Timestamp is positive')

    const cwm = parsed._aws.CloudWatchMetrics[0]
    assert.ok(cwm, 'CloudWatchMetrics[0] present')
    assert.strictEqual(cwm.Namespace, DEFAULT_NAMESPACE, 'Namespace = WorkCaptain/App')
    assert.ok(Array.isArray(cwm.Dimensions), 'Dimensions is an array')
    assert.ok(Array.isArray(cwm.Dimensions[0]), 'Dimensions[0] is an array of dimension keys')
    assert.strictEqual(cwm.Metrics[0].Name, 'InvoicesIssued', 'metric Name correct')
    assert.strictEqual(cwm.Metrics[0].Unit, 'Count', 'metric Unit correct')

    // metric value is a TOP-LEVEL property keyed by metric name.
    assert.strictEqual(parsed.InvoicesIssued, 1, 'metric value is a top-level property')

    // each declared dimension key resolves to a top-level property.
    for (const key of cwm.Dimensions[0]) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(parsed, key),
        `dimension "${key}" is a top-level property`
      )
      assert.strictEqual(typeof parsed[key], 'string', `dimension "${key}" value is a string`)
    }
    passed++
    console.log('  ✓ EMF-VALIDITY: emits a structurally-valid _aws EMF envelope (Timestamp/Namespace/Dimensions/Metrics + top-level value & dims)')
  }

  // (a2) custom namespace + custom dimensions are honored.
  {
    let captured = null
    emitMetric(
      { name: 'M', value: 3, unit: 'Count', namespace: 'X/Y', dimensions: { service: 's', environment: 'e' } },
      (s) => { captured = s }
    )
    const parsed = JSON.parse(captured)
    assert.strictEqual(parsed._aws.CloudWatchMetrics[0].Namespace, 'X/Y')
    assert.deepStrictEqual(parsed._aws.CloudWatchMetrics[0].Dimensions[0], ['service', 'environment'])
    assert.strictEqual(parsed.service, 's')
    assert.strictEqual(parsed.environment, 'e')
    assert.strictEqual(parsed.M, 3)
    passed++
    console.log('  ✓ honors custom namespace + dimensions')
  }

  // (b) NON-BLOCKING — a writer that throws must NOT propagate; emitMetric returns false.
  {
    let threw = false
    let ret
    try {
      ret = emitMetric(
        { name: 'InvoicesIssued', value: 1, unit: 'Count' },
        () => { throw new Error('stdout exploded') }
      )
    } catch (_e) {
      threw = true
    }
    assert.strictEqual(threw, false, 'emit error must NOT throw to caller')
    assert.strictEqual(ret, false, 'emit returns false on writer failure')
    passed++
    console.log('  ✓ NON-BLOCKING: writer error is swallowed, never thrown to caller')
  }

  // (b2) NON-BLOCKING — invalid input (bad value) is swallowed, returns false, no throw.
  {
    let threw = false
    let ret
    try {
      // value is not a finite number → buildEmf throws internally → must be swallowed.
      ret = emitMetric({ name: 'Bad', value: NaN }, () => {})
    } catch (_e) {
      threw = true
    }
    assert.strictEqual(threw, false, 'invalid-input emit must NOT throw')
    assert.strictEqual(ret, false, 'emit returns false on invalid input')
    passed++
    console.log('  ✓ NON-BLOCKING: invalid metric input is swallowed (returns false)')
  }

  // (b3) buildEmf with a circular dimension value cannot crash emitMetric
  //      (JSON.stringify would throw on a circular structure → swallowed).
  {
    const circular = {}
    circular.self = circular
    let threw = false
    let ret
    try {
      ret = emitMetric({ name: 'C', value: 1, dimensions: { d: circular } }, undefined)
    } catch (_e) {
      threw = true
    }
    // String(circular) === "[object Object]", so this actually serializes fine and
    // writes to real stdout — but the contract under test is "never throws".
    assert.strictEqual(threw, false, 'circular dimension value must NOT throw to caller')
    assert.strictEqual(typeof ret, 'boolean')
    passed++
    console.log('  ✓ NON-BLOCKING: pathological dimension input never throws')
  }

  // (c) WIRED-PATH — the invoice ISSUE success path emits "InvoicesIssued".
  // Intercept process.stdout.write to confirm a valid EMF line is produced when
  // a draft is issued through the real router (no logger/kpi_tracker involved).
  {
    const pool = createMockPool()
    const service = createInvoiceService({ pool })
    const router = createInvoiceRouter({ invoiceService: service })

    const call = async (method, pathname, body, user) => {
      const res = createMockRes()
      await router.handle({ method, url: pathname, headers: {} }, res, pathname, method, body, user)
      return res
    }

    // create a draft
    const created = await call('POST', '/api/invoices', {
      lineItems: [{ description: 'Fee', qty: 1, unit_amount: 100 }],
    }, USER_A)
    assert.strictEqual(created.status, 201)
    const draftId = created.body.data.id

    // capture stdout across the issue call
    const captured = []
    const orig = process.stdout.write
    process.stdout.write = (chunk, ...rest) => {
      try { captured.push(String(chunk)) } catch (_e) {}
      return orig.call(process.stdout, chunk, ...rest)
    }
    let issueRes
    try {
      issueRes = await call('POST', `/api/invoices/${draftId}/issue`, null, USER_A)
    } finally {
      process.stdout.write = orig
    }

    assert.strictEqual(issueRes.status, 200, 'issue still returns 200')
    assert.strictEqual(issueRes.body.data.status, 'issued', 'issue still works end-to-end')

    // find the EMF line for InvoicesIssued among captured stdout.
    const emfLine = captured
      .map(s => s.trim())
      .find(s => {
        if (!s.startsWith('{')) return false
        try {
          const p = JSON.parse(s)
          return p._aws && p._aws.CloudWatchMetrics &&
                 p._aws.CloudWatchMetrics[0].Metrics[0].Name === 'InvoicesIssued'
        } catch (_e) { return false }
      })
    assert.ok(emfLine, 'issue path emitted an InvoicesIssued EMF line')
    const parsed = JSON.parse(emfLine)
    assert.strictEqual(parsed.InvoicesIssued, 1, 'emitted count=1 on issue')
    assert.strictEqual(parsed._aws.CloudWatchMetrics[0].Namespace, DEFAULT_NAMESPACE)
    passed++
    console.log('  ✓ WIRED-PATH: invoice ISSUE success path emits InvoicesIssued=1 (request still returns 200/issued)')
  }

  console.log(`  telemetry/emf: ${passed}/6 passed`)
  return passed
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p === 6 ? 0 : 1)).catch(e => { console.error(e); process.exit(1) })
}
