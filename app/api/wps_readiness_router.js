'use strict';

function json(status, body) {
  return { status, body };
}

/**
 * createWpsReadinessRouter — handles WPS Readiness Pack API endpoints.
 *
 * Routes:
 *   POST /onboarding/wps/pack            — generate (idempotent) readiness pack
 *   GET  /onboarding/wps/pack/:pack_id   — retrieve pack by id
 *   GET  /onboarding/wps/evidence/:ep_id — retrieve evidence pack
 *   POST /onboarding/wps/validate-iban   — validate IBAN (returns hash + bank, never raw)
 */
function createWpsReadinessRouter({ wpsReadinessService }) {
  if (!wpsReadinessService) throw new Error('wpsReadinessService is required');

  return {
    async handle(req) {
      const { method, path: p, body } = req;

      // POST /onboarding/wps/validate-iban
      if (method === 'POST' && p === '/onboarding/wps/validate-iban') {
        const { iban } = body || {};
        if (!iban) return json(400, { error: 'MISSING_IBAN', message: 'iban is required' });
        try {
          const result = wpsReadinessService.validateIban(iban);
          // Never echo raw IBAN back
          return json(200, result);
        } catch (e) {
          return json(400, { error: 'VALIDATION_ERROR', message: e.message });
        }
      }

      // POST /onboarding/wps/pack — generate / idempotent upsert
      if (method === 'POST' && p === '/onboarding/wps/pack') {
        try {
          const pack = await wpsReadinessService.generateReadinessPack(body || {});
          return json(201, pack);
        } catch (e) {
          return json(400, { error: 'WPS_PACK_ERROR', message: e.message });
        }
      }

      // GET /onboarding/wps/pack/:pack_id
      const packMatch = p && p.match(/^\/onboarding\/wps\/pack\/([^/]+)$/);
      if (method === 'GET' && packMatch) {
        const packId = packMatch[1];
        const pack = await wpsReadinessService.getReadinessPack(packId);
        if (!pack) return json(404, { error: 'NOT_FOUND', pack_id: packId });
        return json(200, pack);
      }

      // GET /onboarding/wps/evidence/:ep_id
      const epMatch = p && p.match(/^\/onboarding\/wps\/evidence\/([^/]+)$/);
      if (method === 'GET' && epMatch) {
        const epId = epMatch[1];
        const ep = await wpsReadinessService.getEvidencePack(epId);
        if (!ep) return json(404, { error: 'NOT_FOUND', evidence_pack_id: epId });
        return json(200, ep);
      }

      return json(404, { error: 'NOT_FOUND', path: p, method });
    },
  };
}

module.exports = { createWpsReadinessRouter };
