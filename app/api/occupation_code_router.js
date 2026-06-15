'use strict';

// S36-G4: Occupation Code AI Matching — /api/admin/compliance/occupation-code routes
// BRD Refs: WOS §7.2
//
// Routes:
//   POST /api/admin/compliance/occupation-code/suggest
//     Body: { skills[], requisitionTitle, tenantId? }
//     Returns: ranked OccupationCodeSuggestion[]
//
//   POST /api/admin/compliance/occupation-code/validate
//     Body: { candidateId, roleId, occupationCode, tenantId? }
//     Returns: ValidationReport — valid|invalid, flags, titles
//
//   POST /api/admin/compliance/occupation-code/report
//     Body: { candidateId, roleId, occupationCode, candidateName?,
//             roleTitle?, hrDecision?, tenantId? }
//     Returns: HTML compliance report (Content-Disposition: attachment)

function jsonOk(res, data, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, data }));
}

function jsonErr(res, code, message, status = 400) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: { code, message } }));
}

/**
 * Create the occupation code compliance router.
 *
 * @param {Object}   opts
 * @param {Object}   opts.occupationCodeService  - from createOccupationCodeService()
 * @param {Function} opts.authenticate           - (req) => admin | null
 */
function createOccupationCodeRouter({ occupationCodeService, authenticate }) {
  if (!occupationCodeService) throw new Error('occupationCodeService is required');
  if (!authenticate)          throw new Error('authenticate is required');

  async function handle(req, res, url, body) {
    // ── Authentication ───────────────────────────────────────────────────────
    const admin = await Promise.resolve(authenticate(req)).catch(() => null);
    if (!admin) {
      return jsonErr(res, 'UNAUTHORIZED', 'Authentication required', 401);
    }

    const pathname = url.pathname;

    // ── POST /suggest ────────────────────────────────────────────────────────
    if (req.method === 'POST' && pathname === '/api/admin/compliance/occupation-code/suggest') {
      const { skills, requisitionTitle, tenantId } = body || {};
      if (!Array.isArray(skills) || skills.length === 0) {
        return jsonErr(res, 'MISSING_SKILLS', 'skills array is required', 422);
      }
      if (!requisitionTitle || typeof requisitionTitle !== 'string') {
        return jsonErr(res, 'MISSING_REQUISITION_TITLE', 'requisitionTitle is required', 422);
      }

      let suggestions;
      try {
        suggestions = await occupationCodeService.suggestOccupationCode({
          skills,
          requisitionTitle,
          tenantId: tenantId || admin.tenantId || 'default',
          actorId:  admin.id || admin.adminId || 'admin',
        });
      } catch (err) {
        return jsonErr(res, 'SUGGEST_ERROR', err.message, 422);
      }
      return jsonOk(res, { suggestions, policyVersion: occupationCodeService.getPolicyVersion() });
    }

    // ── POST /validate ───────────────────────────────────────────────────────
    if (req.method === 'POST' && pathname === '/api/admin/compliance/occupation-code/validate') {
      const { candidateId, roleId, occupationCode, tenantId } = body || {};
      if (!candidateId)    return jsonErr(res, 'MISSING_CANDIDATE_ID',    'candidateId is required',    422);
      if (!roleId)         return jsonErr(res, 'MISSING_ROLE_ID',         'roleId is required',         422);
      if (!occupationCode) return jsonErr(res, 'MISSING_OCCUPATION_CODE', 'occupationCode is required', 422);

      let report;
      try {
        report = occupationCodeService.validatePairing({
          candidateId,
          roleId,
          occupationCode,
          tenantId: tenantId || admin.tenantId || 'default',
        });
      } catch (err) {
        return jsonErr(res, 'VALIDATE_ERROR', err.message, 422);
      }
      return jsonOk(res, { report, policyVersion: occupationCodeService.getPolicyVersion() });
    }

    // ── POST /report ─────────────────────────────────────────────────────────
    // POST rather than GET — body carries PII (candidateName, roleTitle)
    if (req.method === 'POST' && pathname === '/api/admin/compliance/occupation-code/report') {
      const { candidateId, roleId, occupationCode, candidateName, roleTitle, hrDecision, tenantId } = body || {};
      if (!candidateId)    return jsonErr(res, 'MISSING_CANDIDATE_ID',    'candidateId is required',    422);
      if (!roleId)         return jsonErr(res, 'MISSING_ROLE_ID',         'roleId is required',         422);
      if (!occupationCode) return jsonErr(res, 'MISSING_OCCUPATION_CODE', 'occupationCode is required', 422);

      let reportResult;
      try {
        reportResult = occupationCodeService.exportComplianceReport({
          candidateId,
          roleId,
          occupationCode,
          candidateName,
          roleTitle,
          hrDecision,
          tenantId: tenantId || admin.tenantId || 'default',
        });
      } catch (err) {
        return jsonErr(res, 'REPORT_ERROR', err.message, 422);
      }

      res.writeHead(200, {
        'content-type':        reportResult.contentType,
        'content-disposition': `attachment; filename="${reportResult.filename}"`,
        'cache-control':       'no-store',
      });
      res.end(reportResult.html);
      return;
    }

    // ── 404 ──────────────────────────────────────────────────────────────────
    return jsonErr(res, 'NOT_FOUND', `No occupation-code route for ${req.method} ${pathname}`, 404);
  }

  return { handle };
}

module.exports = { createOccupationCodeRouter };
