'use strict';

const path = require('path');
const fs   = require('fs');

const POLICY = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../config/evidence/evidence_pack_policy_v1.json'),
    'utf8'
  )
);

const RULES       = POLICY.redaction.rules;
const PLACEHOLDER = POLICY.redaction.redactionPlaceholder;

// ── helpers ───────────────────────────────────────────────────────────────────

function clone(v) { return JSON.parse(JSON.stringify(v)); }

/**
 * fieldMatchesPattern — checks if a field key matches any redaction pattern.
 * Case-insensitive substring match on field name.
 */
function fieldMatchesPattern(fieldKey, pattern) {
  return String(fieldKey).toLowerCase().includes(pattern.toLowerCase());
}

/**
 * roleAllowed — true if requestingRole is in the allowed list for this rule.
 */
function roleAllowed(requestingRole, allowedRoles) {
  return allowedRoles.includes(String(requestingRole || '').toUpperCase());
}

/**
 * redactObject — recursively traverses an object and replaces restricted fields
 * with PLACEHOLDER for the requesting role. Non-destructive — operates on clone.
 */
function redactObject(obj, requestingRole) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => redactObject(item, requestingRole));

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const matchedRule = RULES.find(r => fieldMatchesPattern(key, r.field_pattern));
    if (matchedRule && !roleAllowed(requestingRole, matchedRule.allowed_roles)) {
      result[key] = PLACEHOLDER;
    } else {
      result[key] = (value && typeof value === 'object') ? redactObject(value, requestingRole) : value;
    }
  }
  return result;
}

// ── redaction service ─────────────────────────────────────────────────────────

/**
 * applyRedactionRules(pack, requestingRole) — non-destructive PDPL-compliant redaction.
 *
 * Returns a deep copy of the pack with restricted fields replaced by PLACEHOLDER.
 * Original pack in storage is never modified.
 *
 * @param pack           — EvidencePack object
 * @param requestingRole — 'HR' | 'FINANCE' | 'MANAGER' | 'VIEWER' | 'AI' | 'SYSTEM'
 */
function applyRedactionRules(pack, requestingRole) {
  if (!pack) return pack;
  const role = String(requestingRole || 'VIEWER').toUpperCase();

  const redacted = clone(pack);

  // Redact data_snapshot fields
  if (redacted.data_snapshot) {
    redacted.data_snapshot = redactObject(redacted.data_snapshot, role);
  }

  // Redact attached_files fields
  if (Array.isArray(redacted.attached_files)) {
    redacted.attached_files = redacted.attached_files.map(f => redactObject(f, role));
  }

  // Redact approval_chain
  if (Array.isArray(redacted.approval_chain)) {
    redacted.approval_chain = redacted.approval_chain.map(a => redactObject(a, role));
  }

  // Track which rules were applied
  redacted._redaction_applied = true;
  redacted._requesting_role   = role;

  return redacted;
}

/**
 * describeRedactedFields — returns a list of field patterns that ARE redacted
 * for the given role (for UI indicator).
 */
function describeRedactedFields(requestingRole) {
  const role = String(requestingRole || 'VIEWER').toUpperCase();
  return RULES
    .filter(r => !roleAllowed(role, r.allowed_roles))
    .map(r => ({ field_pattern: r.field_pattern, pdpl_article: r.pdpl_article }));
}

module.exports = {
  applyRedactionRules,
  describeRedactedFields,
  POLICY,
};
