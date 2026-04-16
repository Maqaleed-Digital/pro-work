'use strict';

// S36-G3: Nitaqat Saudization compliance — /api/admin/compliance/nitaqat routes
// BRD Refs: Gold BRD A4, RT-1 §4.1, KSA Sovereign Compliance Layer
//
// Routes:
//   POST /api/admin/compliance/nitaqat/preview
//     Body: NitaqatParams → returns NitaqatImpactResult (view only, no write)
//
//   POST /api/admin/compliance/nitaqat/override
//     Body: { params, overriddenParams, reason, candidateId }
//     Requires reason (min 10 chars)
//     Writes append-only record to override store
//     Returns recalculated NitaqatImpactResult with overridden params

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
 * Create the Nitaqat compliance router.
 *
 * @param {Object} opts
 * @param {Object} opts.nitaqatEngine   - instance from createNitaqatPolicyEngine()
 * @param {Object} opts.overrideStore   - instance from InMemoryOverrideStore() or DB adapter
 * @param {Function} opts.authenticate  - (req) => { adminId } | null
 */
function createNitaqatRouter({ nitaqatEngine, overrideStore, authenticate }) {
  if (!nitaqatEngine)  throw new Error('nitaqatEngine is required');
  if (!overrideStore)  throw new Error('overrideStore is required');
  if (!authenticate)   throw new Error('authenticate is required');

  async function handle(req, res, url, body) {
    // ── Authentication ───────────────────────────────────────────────────────
    const admin = await Promise.resolve(authenticate(req)).catch(() => null);
    if (!admin) {
      return jsonErr(res, 'UNAUTHORIZED', 'Authentication required', 401);
    }

    const pathname = url.pathname;

    // ── POST /preview ────────────────────────────────────────────────────────
    if (req.method === 'POST' && pathname === '/api/admin/compliance/nitaqat/preview') {
      let result;
      try {
        result = nitaqatEngine.calculateImpact(body);
      } catch (err) {
        return jsonErr(res, 'INVALID_PARAMS', err.message, 422);
      }
      return jsonOk(res, {
        result,
        policyVersion: nitaqatEngine.getPolicyVersion(),
        previewOnly: true,
      });
    }

    // ── POST /override ───────────────────────────────────────────────────────
    if (req.method === 'POST' && pathname === '/api/admin/compliance/nitaqat/override') {
      const { params, overriddenParams, reason, candidateId } = body || {};

      if (!candidateId) {
        return jsonErr(res, 'MISSING_CANDIDATE_ID', 'candidateId is required', 422);
      }

      // Reason validation — mandatory, min 10 chars
      if (!reason || String(reason).trim().length < MIN_REASON_LENGTH) {
        return jsonErr(
          res,
          'REASON_REQUIRED',
          `Override requires a reason of at least ${MIN_REASON_LENGTH} characters`,
          422
        );
      }

      if (!overriddenParams || typeof overriddenParams !== 'object') {
        return jsonErr(res, 'MISSING_OVERRIDDEN_PARAMS', 'overriddenParams is required', 422);
      }

      // Recalculate with overridden params
      let result;
      try {
        result = nitaqatEngine.calculateImpact(overriddenParams);
      } catch (err) {
        return jsonErr(res, 'INVALID_OVERRIDDEN_PARAMS', err.message, 422);
      }

      // Determine tenant from admin context (with fallback to header)
      const tenantId = (admin.tenantId) ||
        req.headers['x-tenant-id'] ||
        'default';

      // Append-only write — no update/delete path exists
      const record = overrideStore.insert({
        tenantId,
        candidateId,
        originalParams:   params   || null,
        overriddenParams: overriddenParams,
        overriddenBy:     admin.id || admin.adminId || 'unknown',
        reason:           String(reason).trim(),
        evidencePackId:   body.evidencePackId || null,
      });

      return jsonOk(res, {
        overrideId:    record.id,
        result,
        policyVersion: nitaqatEngine.getPolicyVersion(),
        recordedAt:    record.timestamp,
      }, 201);
    }

    // ── 404 ──────────────────────────────────────────────────────────────────
    return jsonErr(res, 'NOT_FOUND', `No Nitaqat route for ${req.method} ${pathname}`, 404);
  }

  return { handle };
}

module.exports = { createNitaqatRouter };
