'use strict'

const { emitMetric } = require('../modules/telemetry/emf')

/**
 * WC-06: Invoice API router.
 *
 * Routes (all auth-gated — tenant + actor come from req.user):
 *   POST /api/invoices            — create draft invoice
 *   POST /api/invoices/:id/issue  — draft → issued (assigns invoice_number)
 *   POST /api/invoices/:id/void   — draft|issued → void
 *   GET  /api/invoices/:id        — fetch invoice + line items
 *
 * Issuance-only: `issued` does NOT require any paid/charged state. No coupling
 * to payments (WC-05). ZATCA/Fatoorah e-invoicing is OUT OF SCOPE.
 *
 * @param {Object} opts
 * @param {Object} opts.invoiceService — from createInvoiceService()
 */
function createInvoiceRouter(opts) {
  if (!opts || !opts.invoiceService) throw new Error('invoiceService is required')
  const invoiceService = opts.invoiceService

  function ok(res, data, status) {
    const body = JSON.stringify({ ok: true, data })
    res.writeHead(status || 200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(body)
  }

  function fail(res, code, message, status) {
    const body = JSON.stringify({ ok: false, error: { code, message } })
    res.writeHead(status || 400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(body)
  }

  async function handle(req, res, pathname, method, body, user) {
    // All invoice routes require auth.
    if (!user) return fail(res, 'UNAUTHORIZED', 'authentication required', 401)

    const tenantId = user.tenant_id

    // POST /api/invoices — create draft
    if (pathname === '/api/invoices' && method === 'POST') {
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)
      const { lineItems, currency, vatRate } = body
      try {
        const invoice = await invoiceService.createInvoice({
          tenantId,
          createdBy: user.id,
          lineItems,
          currency,
          vatRate,
        })
        return ok(res, invoice, 201)
      } catch (e) {
        return fail(res, e.status === 422 ? 'VALIDATION_ERROR' : 'INVOICE_ERROR', e.message, e.status || 400)
      }
    }

    // POST /api/invoices/:id/issue
    const issueMatch = pathname.match(/^\/api\/invoices\/([^/]+)\/issue$/)
    if (issueMatch && method === 'POST') {
      try {
        const invoice = await invoiceService.issueInvoice({
          invoiceId: issueMatch[1],
          tenantId,
          issuedBy: user.id,
        })
        // F-06: emit ONE operational metric on the issue success path.
        // Non-blocking by construction — emitMetric swallows all errors and
        // can never throw into the request path.
        emitMetric({ name: 'InvoicesIssued', value: 1, unit: 'Count' })
        return ok(res, invoice, 200)
      } catch (e) {
        return fail(res, e.status === 404 ? 'NOT_FOUND' : 'INVOICE_ERROR', e.message, e.status || 400)
      }
    }

    // POST /api/invoices/:id/void
    const voidMatch = pathname.match(/^\/api\/invoices\/([^/]+)\/void$/)
    if (voidMatch && method === 'POST') {
      try {
        const invoice = await invoiceService.voidInvoice({
          invoiceId: voidMatch[1],
          tenantId,
        })
        return ok(res, invoice, 200)
      } catch (e) {
        return fail(res, e.status === 404 ? 'NOT_FOUND' : 'INVOICE_ERROR', e.message, e.status || 400)
      }
    }

    // GET /api/invoices/:id
    const getMatch = pathname.match(/^\/api\/invoices\/([^/]+)$/)
    if (getMatch && method === 'GET') {
      try {
        const invoice = await invoiceService.getInvoice({
          invoiceId: getMatch[1],
          tenantId,
        })
        return ok(res, invoice, 200)
      } catch (e) {
        return fail(res, e.status === 404 ? 'NOT_FOUND' : 'INVOICE_ERROR', e.message, e.status || 400)
      }
    }

    return fail(res, 'NOT_FOUND', 'invoice route not found', 404)
  }

  return { handle }
}

module.exports = { createInvoiceRouter }
