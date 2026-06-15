'use strict';

// S36-G4: Occupation Code AI Matching + Validation
// BRD Refs: WOS §7.2
//
// Design constraints:
//   - All occupation code policy from versioned config — zero hardcoded codes
//   - Prohibited titles block selection (not just warn)
//   - All AI suggestions logged to recommendation_audit_logs (actionType: COMPLIANCE_HINT)
//   - auditLogService is an optional injection — omit for unit testing
//   - Factory function pattern, CommonJS

const crypto = require('crypto');

const MAX_SUGGESTIONS    = 5;
const MIN_CONFIDENCE     = 0.05; // suppress zero-match noise below this threshold

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Tokenize a string into lowercase words of length > 2.
 */
function tokenize(text) {
  return (text || '').toLowerCase().split(/[\s,;\/\-_]+/).filter(w => w.length > 2);
}

/**
 * Compute a confidence score: fraction of code's skill keywords
 * found in the input token set.
 *
 * @param {Set<string>} inputSet   - tokenized input words
 * @param {string[]}    codeSkills - skill keywords from config
 * @returns {number} 0.00 – 1.00
 */
function computeConfidence(inputSet, codeSkills) {
  const keywords = codeSkills.map(w => w.toLowerCase()).filter(w => w.length > 2);
  if (keywords.length === 0) return 0;
  const matched = keywords.filter(w => inputSet.has(w)).length;
  return Math.min(1.0, matched / keywords.length);
}

/**
 * Compute validation flags for a code entry given input skills.
 */
function computeFlags(codeEntry, skills) {
  const flags = [];
  if (codeEntry.isProhibited) flags.push('PROHIBITED_TITLE');
  const lowerSkills = skills.map(s => s.toLowerCase());
  const missing = (codeEntry.requiredCredentials || []).filter(cred => {
    const credLower = cred.toLowerCase();
    return !lowerSkills.some(s => s.includes(credLower.split(' ')[0]));
  });
  if (missing.length > 0) flags.push('MISSING_CREDENTIALS');
  return { flags, missingCredentials: missing };
}

/**
 * Generate a deterministic prompt hash for audit log.
 */
function hashPrompt(skills, requisitionTitle) {
  const payload = JSON.stringify({ skills: [...skills].sort(), requisitionTitle });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Build a printer-ready HTML compliance report.
 * Can be rendered as PDF from browser via window.print() or headless Chrome.
 */
function buildHtmlReport({ candidateId, roleId, occupationCode, candidateName, roleTitle, hrDecision, validationReport, tenantId, generatedAt }) {
  const flagBadges = (validationReport.flags || []).map(f => {
    const colour = f === 'PROHIBITED_TITLE' ? '#ef4444'
      : f === 'MISSING_CREDENTIALS'         ? '#f59e0b'
      : '#6b7280';
    return `<span style="background:${colour};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;margin-right:4px">${f}</span>`;
  }).join('');

  const decisionColour = hrDecision === 'APPROVED'  ? '#22c55e'
    : hrDecision === 'REJECTED'                      ? '#ef4444'
    : '#f59e0b';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Occupation Code Compliance Report — ${candidateId}</title>
<style>
  @media print { @page { margin: 20mm; } .no-print { display: none; } }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; margin: 0; padding: 24px; direction: rtl; }
  .header { border-bottom: 2px solid #1e40af; padding-bottom: 12px; margin-bottom: 20px; }
  .title { font-size: 20px; font-weight: 700; color: #1e40af; }
  .subtitle { font-size: 12px; color: #6b7280; margin-top: 4px; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 13px; font-weight: 700; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 10px; }
  .field { display: flex; gap: 12px; margin-bottom: 8px; font-size: 12px; }
  .field-label { color: #6b7280; min-width: 160px; }
  .field-value { font-weight: 600; }
  .decision-badge { display: inline-block; background: ${decisionColour}; color: #fff; padding: 3px 12px; border-radius: 4px; font-size: 12px; font-weight: 700; }
  .footer { border-top: 1px solid #e5e7eb; padding-top: 10px; font-size: 10px; color: #9ca3af; margin-top: 32px; }
</style>
</head>
<body>
<div class="header">
  <div class="title">تقرير مطابقة المسمى الوظيفي — Occupation Code Compliance Report</div>
  <div class="subtitle">ProWork Sovereign Compliance Layer · Tenant: ${tenantId} · Generated: ${generatedAt}</div>
</div>

<div class="section">
  <div class="section-title">Candidate &amp; Role — المرشح والدور</div>
  <div class="field"><span class="field-label">Candidate ID:</span><span class="field-value">${candidateId}</span></div>
  <div class="field"><span class="field-label">Candidate Name:</span><span class="field-value">${candidateName || '—'}</span></div>
  <div class="field"><span class="field-label">Role ID:</span><span class="field-value">${roleId}</span></div>
  <div class="field"><span class="field-label">Role Title:</span><span class="field-value">${roleTitle || '—'}</span></div>
</div>

<div class="section">
  <div class="section-title">Occupation Code — رمز المهنة</div>
  <div class="field"><span class="field-label">Code:</span><span class="field-value">${occupationCode}</span></div>
  <div class="field"><span class="field-label">Title (EN):</span><span class="field-value">${validationReport.titleEN || '—'}</span></div>
  <div class="field"><span class="field-label">Title (AR):</span><span class="field-value">${validationReport.titleAR || '—'}</span></div>
  <div class="field"><span class="field-label">Validation Flags:</span><span class="field-value">${flagBadges || '<span style="color:#22c55e">✓ All Clear</span>'}</span></div>
</div>

<div class="section">
  <div class="section-title">HR Decision — قرار الموارد البشرية</div>
  <div class="field"><span class="field-label">Decision:</span><span class="field-value"><span class="decision-badge">${hrDecision || 'PENDING'}</span></span></div>
  <div class="field"><span class="field-label">Valid Pairing:</span><span class="field-value">${validationReport.valid ? '✓ Yes' : '✗ No'}</span></div>
  <div class="field"><span class="field-label">Validated At:</span><span class="field-value">${validationReport.validatedAt}</span></div>
</div>

<div class="footer">
  This report is generated by the ProWork Sovereign Compliance Layer.
  Retain for regulatory audit purposes. Tenant: ${tenantId}.
  Generated at: ${generatedAt}
</div>
</body>
</html>`;
}

// ── Service factory ───────────────────────────────────────────────────────────

/**
 * Create an OccupationCodeService from a versioned occupation code config.
 *
 * @param {Object}  config           - occupation-codes-ksav1.json (or compatible)
 * @param {Object}  [auditLogService] - optional S36-G1 service for COMPLIANCE_HINT logging
 * @returns {{ suggestOccupationCode, validatePairing, exportComplianceReport, getPolicyVersion }}
 */
function createOccupationCodeService({ config, auditLogService = null } = {}) {
  if (!config || !Array.isArray(config.codes)) {
    throw new Error('config with codes array is required');
  }

  const codeIndex = new Map(config.codes.map(c => [c.code, c]));

  /**
   * Suggest occupation codes for a candidate given skills and requisition title.
   *
   * @param {Object}   params
   * @param {string[]} params.skills           - candidate skill strings
   * @param {string}   params.requisitionTitle - job title / requisition name
   * @param {string}   [params.tenantId]
   * @param {string}   [params.actorId]
   * @returns {OccupationCodeSuggestion[]}     - ranked, top MAX_SUGGESTIONS
   */
  async function suggestOccupationCode({ skills = [], requisitionTitle = '', tenantId = 'default', actorId = 'system' } = {}) {
    const inputTokens  = tokenize([...skills, requisitionTitle].join(' '));
    const inputSet     = new Set(inputTokens);

    const scored = config.codes.map(code => {
      const confidence = computeConfidence(inputSet, code.skills);
      const { flags, missingCredentials } = computeFlags(code, skills);
      if (confidence < MIN_CONFIDENCE && !code.isProhibited) return null;
      return {
        code:               code.code,
        titleAR:            code.titleAR,
        titleEN:            code.titleEN,
        confidenceScore:    round2(confidence),
        validationFlags:    flags,
        isProhibited:       !!code.isProhibited,
        missingCredentials,
      };
    }).filter(Boolean);

    const ranked = scored
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, MAX_SUGGESTIONS);

    // Log to audit trail if service is wired (non-blocking — failure must not surface)
    if (auditLogService && ranked.length > 0) {
      try {
        auditLogService.write({
          actor:          actorId,
          actionType:     'COMPLIANCE_HINT',
          inputSignals:   { skills, requisitionTitle },
          rationale:      `Top suggestion: ${ranked[0].code} (${ranked[0].titleEN}) confidence=${ranked[0].confidenceScore}`,
          confidenceScore: ranked[0].confidenceScore,
          modelVersion:   'occupation-code-matcher-' + config.version,
          promptHash:     hashPrompt(skills, requisitionTitle),
          outputSnapshot: { suggestions: ranked.slice(0, 3) },
          tenantId,
        });
      } catch (_) { /* audit log failure must not block suggestion */ }
    }

    return ranked;
  }

  /**
   * Validate a candidate/role occupation code pairing.
   *
   * @param {Object} params
   * @param {string} params.candidateId
   * @param {string} params.roleId
   * @param {string} params.occupationCode
   * @param {string} [params.tenantId]
   * @returns {ValidationReport}
   */
  function validatePairing({ candidateId, roleId, occupationCode, tenantId = 'default' } = {}) {
    if (!candidateId)    throw new Error('candidateId is required');
    if (!roleId)         throw new Error('roleId is required');
    if (!occupationCode) throw new Error('occupationCode is required');

    const codeEntry = codeIndex.get(occupationCode);
    if (!codeEntry) {
      return {
        valid: false,
        code:  occupationCode,
        titleEN: null,
        titleAR: null,
        flags:  ['UNKNOWN_CODE'],
        candidateId,
        roleId,
        tenantId,
        validatedAt: new Date().toISOString(),
      };
    }

    const flags = [];
    if (codeEntry.isProhibited) flags.push('PROHIBITED_TITLE');

    return {
      valid:       !codeEntry.isProhibited && flags.length === 0,
      code:        occupationCode,
      titleEN:     codeEntry.titleEN,
      titleAR:     codeEntry.titleAR,
      flags,
      prohibitedReason: codeEntry.prohibitedReason || null,
      candidateId,
      roleId,
      tenantId,
      validatedAt: new Date().toISOString(),
    };
  }

  /**
   * Export a printer-ready HTML compliance report for a candidate/role pairing.
   *
   * @param {Object} params
   * @param {string} params.candidateId
   * @param {string} params.roleId
   * @param {string} params.occupationCode
   * @param {string} [params.candidateName]
   * @param {string} [params.roleTitle]
   * @param {string} [params.hrDecision]    - APPROVED | REJECTED | PENDING
   * @param {string} [params.tenantId]
   * @returns {{ html: string, filename: string, contentType: string }}
   */
  function exportComplianceReport({ candidateId, roleId, occupationCode, candidateName, roleTitle, hrDecision = 'PENDING', tenantId = 'default' } = {}) {
    if (!candidateId)    throw new Error('candidateId is required');
    if (!roleId)         throw new Error('roleId is required');
    if (!occupationCode) throw new Error('occupationCode is required');

    const validationReport = validatePairing({ candidateId, roleId, occupationCode, tenantId });
    const generatedAt      = new Date().toISOString();
    const html             = buildHtmlReport({
      candidateId, roleId, occupationCode, candidateName, roleTitle,
      hrDecision, validationReport, tenantId, generatedAt,
    });
    const filename = `compliance-report-${candidateId}-${occupationCode}-${Date.now()}.html`;

    return { html, filename, contentType: 'text/html; charset=utf-8', generatedAt };
  }

  function getPolicyVersion() {
    return config.version;
  }

  return { suggestOccupationCode, validatePairing, exportComplianceReport, getPolicyVersion };
}

module.exports = { createOccupationCodeService };
