'use strict'

const crypto = require('crypto')
const { DEFAULT_VAT_RATE, DEFAULT_CURRENCY } = require('./invoice_config')

/**
 * WC-06: Invoice create/issue service.
 *
 * Issuance-only lifecycle: draft → issued → void. `issued` does NOT require any
 * paid/charged state — no coupling to payments/HyperPay/collection (WC-05).
 *
 * Amounts come from request input; VAT rate is config-overridable (Register B
 * is authoritative). ZATCA/Fatoorah e-invoicing is OUT OF SCOPE.
 *
 * All operations are tenant-scoped — no cross-tenant reads or writes.
 *
 * @param {Object} opts
 * @param {Object} opts.pool — pg Pool
 */
function createInvoiceService(opts) {
  if (!opts || !opts.pool) throw new Error('pool is required')
  const pool = opts.pool

  function err(message, status) {
    return Object.assign(new Error(message), { status })
  }

  // Round to 2 decimals (half-up) for monetary fields.
  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100
  }

  // Zero-pad a positive integer to at least 4 digits.
  function pad4(n) {
    return String(n).padStart(4, '0')
  }

  // Short, stable tenant token for the human-readable invoice number.
  function tenantShort(tenantId) {
    return String(tenantId).replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || 'TENANT'
  }

  async function loadLineItems(client, invoiceId) {
    const r = await client.query(
      `SELECT id, invoice_id, description, qty, unit_amount, line_total
         FROM invoice_line_items WHERE invoice_id = $1 ORDER BY id`,
      [invoiceId]
    )
    return r.rows
  }

  /**
   * Create a draft invoice with line items in one transaction.
   * @returns the invoice row with `.line_items`
   */
  async function createInvoice({ tenantId, createdBy, lineItems, currency, vatRate }) {
    if (!tenantId) throw err('tenantId is required', 422)
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      throw err('at least one line item is required', 422)
    }

    const normalized = lineItems.map((li, i) => {
      if (!li || typeof li !== 'object') throw err(`lineItems[${i}]: object required`, 422)
      const description = li.description
      if (description === undefined || description === null || String(description).trim() === '') {
        throw err(`lineItems[${i}].description: required`, 422)
      }
      const qty = Number(li.qty)
      const unit = Number(li.unit_amount)
      if (!Number.isFinite(qty))  throw err(`lineItems[${i}].qty: must be a number`, 422)
      if (!Number.isFinite(unit)) throw err(`lineItems[${i}].unit_amount: must be a number`, 422)
      return {
        description: String(description),
        qty: round2(qty),
        unit_amount: round2(unit),
        line_total: round2(qty * unit),
      }
    })

    const subtotal = round2(normalized.reduce((s, li) => s + li.line_total, 0))
    const rate     = vatRate === undefined || vatRate === null ? DEFAULT_VAT_RATE : Number(vatRate)
    if (!Number.isFinite(rate)) throw err('vatRate: must be a number', 422)
    const vatAmount = round2(subtotal * rate)
    const total     = round2(subtotal + vatAmount)
    const cur       = currency || DEFAULT_CURRENCY

    const invoiceId = crypto.randomUUID()

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const inv = await client.query(
        `INSERT INTO invoices
           (id, tenant_id, currency, subtotal, vat_rate, vat_amount, total, status, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, now())
         RETURNING *`,
        [invoiceId, tenantId, cur, subtotal, rate, vatAmount, total, createdBy || null]
      )
      for (const li of normalized) {
        await client.query(
          `INSERT INTO invoice_line_items (id, invoice_id, description, qty, unit_amount, line_total)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [crypto.randomUUID(), invoiceId, li.description, li.qty, li.unit_amount, li.line_total]
        )
      }
      const lineItemsRows = await loadLineItems(client, invoiceId)
      await client.query('COMMIT')
      return { ...inv.rows[0], line_items: lineItemsRows }
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  }

  /**
   * Issue a draft invoice: assign a per-tenant sequential invoice_number and
   * transition draft → issued. Idempotency is not implied; only draft → issued.
   */
  async function issueInvoice({ invoiceId, tenantId, issuedBy }) {
    if (!invoiceId) throw err('invoiceId is required', 422)
    if (!tenantId)  throw err('tenantId is required', 422)

    const attempt = async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const sel = await client.query(
          `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [invoiceId, tenantId]
        )
        if (sel.rows.length === 0) {
          await client.query('ROLLBACK').catch(() => {})
          throw err('invoice not found', 404)
        }
        const invoice = sel.rows[0]
        if (invoice.status !== 'draft') {
          await client.query('ROLLBACK').catch(() => {})
          throw err('invoice is not in draft', 409)
        }

        // Per-tenant sequential number: count of invoices that have already been
        // assigned a number (i.e. were issued at some point) + 1. We count by
        // invoice_number IS NOT NULL rather than status = 'issued' so that an
        // invoice voided *after* issuance still consumes its number — otherwise
        // the next issuance would re-derive a taken number and collide.
        const cnt = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM invoices WHERE tenant_id = $1 AND invoice_number IS NOT NULL`,
          [tenantId]
        )
        const seq = Number(cnt.rows[0].cnt) + 1
        const invoiceNumber = `INV-${tenantShort(tenantId)}-${pad4(seq)}`

        const upd = await client.query(
          `UPDATE invoices
              SET status = 'issued', issued_at = now(), issued_by = $1, invoice_number = $2
            WHERE id = $3 AND tenant_id = $4
          RETURNING *`,
          [issuedBy || null, invoiceNumber, invoiceId, tenantId]
        )
        const lineItemsRows = await loadLineItems(client, invoiceId)
        await client.query('COMMIT')
        return { ...upd.rows[0], line_items: lineItemsRows }
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw e
      } finally {
        client.release()
      }
    }

    try {
      return await attempt()
    } catch (e) {
      // Retry once on invoice_number UNIQUE collision (concurrent issuance).
      const isUnique = e && (e.code === '23505' || /unique/i.test(String(e.message)))
      if (isUnique && !e.status) return attempt()
      throw e
    }
  }

  /**
   * Void an invoice (draft|issued → void) in one transaction.
   */
  async function voidInvoice({ invoiceId, tenantId }) {
    if (!invoiceId) throw err('invoiceId is required', 422)
    if (!tenantId)  throw err('tenantId is required', 422)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const sel = await client.query(
        `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [invoiceId, tenantId]
      )
      if (sel.rows.length === 0) {
        await client.query('ROLLBACK').catch(() => {})
        throw err('invoice not found', 404)
      }
      const invoice = sel.rows[0]
      if (invoice.status === 'void') {
        await client.query('ROLLBACK').catch(() => {})
        throw err('invoice is already void', 409)
      }
      const upd = await client.query(
        `UPDATE invoices SET status = 'void' WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [invoiceId, tenantId]
      )
      const lineItemsRows = await loadLineItems(client, invoiceId)
      await client.query('COMMIT')
      return { ...upd.rows[0], line_items: lineItemsRows }
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  }

  /**
   * Fetch a single invoice with line items, scoped to tenant.
   */
  async function getInvoice({ invoiceId, tenantId }) {
    if (!invoiceId) throw err('invoiceId is required', 422)
    if (!tenantId)  throw err('tenantId is required', 422)

    const sel = await pool.query(
      `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`,
      [invoiceId, tenantId]
    )
    if (sel.rows.length === 0) throw err('invoice not found', 404)
    const items = await pool.query(
      `SELECT id, invoice_id, description, qty, unit_amount, line_total
         FROM invoice_line_items WHERE invoice_id = $1 ORDER BY id`,
      [invoiceId]
    )
    return { ...sel.rows[0], line_items: items.rows }
  }

  return { createInvoice, issueInvoice, voidInvoice, getInvoice }
}

module.exports = { createInvoiceService }
