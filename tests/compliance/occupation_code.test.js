'use strict';

// S36-G4: Occupation Code AI Matching tests
// Run: node --test tests/compliance/occupation_code.test.js

const test   = require('node:test');
const assert = require('node:assert/strict');

const { createOccupationCodeService } = require('../../app/modules/compliance/occupation_code_service');
const policy = require('../../app/config/compliance/occupation-codes-ksav1.json');

const service = createOccupationCodeService({ config: policy });

// ─────────────────────────────────────────────────────────────────────────────
// 1. Policy version
// ─────────────────────────────────────────────────────────────────────────────
test('getPolicyVersion returns version from config', () => {
  const v = service.getPolicyVersion();
  assert.equal(typeof v, 'string');
  assert.ok(v.length > 0);
  assert.equal(v, policy.version);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. suggestOccupationCode — result shape
// ─────────────────────────────────────────────────────────────────────────────
test('suggestOccupationCode returns array of suggestions', async () => {
  const results = await service.suggestOccupationCode({
    skills: ['javascript', 'react', 'node', 'api'],
    requisitionTitle: 'Software Developer',
  });
  assert.ok(Array.isArray(results), 'must return array');
  assert.ok(results.length > 0, 'must return at least one suggestion for known skills');
});

test('each suggestion has all required fields', async () => {
  const results = await service.suggestOccupationCode({
    skills: ['accounting', 'finance', 'audit'],
    requisitionTitle: 'Accountant',
  });
  assert.ok(results.length > 0);
  const s = results[0];
  assert.ok('code'             in s, 'code missing');
  assert.ok('titleEN'          in s, 'titleEN missing');
  assert.ok('titleAR'          in s, 'titleAR missing');
  assert.ok('confidenceScore'  in s, 'confidenceScore missing');
  assert.ok('validationFlags'  in s, 'validationFlags missing');
  assert.ok('isProhibited'     in s, 'isProhibited missing');
  assert.ok('missingCredentials' in s, 'missingCredentials missing');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Suggestion ranking — most relevant first
// ─────────────────────────────────────────────────────────────────────────────
test('software skills rank Software Developer code highest', async () => {
  const results = await service.suggestOccupationCode({
    skills: ['javascript', 'python', 'software', 'programming', 'development', 'coding', 'api', 'backend'],
    requisitionTitle: 'Software Developer',
  });
  assert.ok(results.length > 0);
  assert.equal(results[0].code, '2512', 'Software Developer (2512) should rank first');
});

test('suggestions are ranked in descending confidence order', async () => {
  const results = await service.suggestOccupationCode({
    skills: ['accounting', 'finance', 'audit', 'ifrs'],
    requisitionTitle: 'Financial Professional',
  });
  for (let i = 1; i < results.length; i++) {
    assert.ok(
      results[i].confidenceScore <= results[i - 1].confidenceScore,
      `result[${i}] should have <= confidence than result[${i-1}]`
    );
  }
});

test('returns at most 5 suggestions', async () => {
  const results = await service.suggestOccupationCode({
    skills: ['management', 'leadership', 'teaching', 'engineering', 'medical', 'finance'],
    requisitionTitle: 'Mixed Role',
  });
  assert.ok(results.length <= 5, `must return at most 5, got ${results.length}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Prohibited title — flagged in suggestions, not blocked from appearing
// ─────────────────────────────────────────────────────────────────────────────
test('prohibited codes have isProhibited=true and PROHIBITED_TITLE flag', async () => {
  // Suggest with empty skills so all codes score low — look for prohibited in list
  const results = await service.suggestOccupationCode({
    skills: [],
    requisitionTitle: 'Prohibited Classification A',
  });
  // Prohibited codes are included in results when they match
  const prohibited = results.filter(r => r.isProhibited);
  // We can't guarantee they appear in top 5 with low confidence,
  // so test validatePairing for blocked assertion (see below)
  prohibited.forEach(p => {
    assert.ok(p.validationFlags.includes('PROHIBITED_TITLE'), 'prohibited must have PROHIBITED_TITLE flag');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Missing credentials flag
// ─────────────────────────────────────────────────────────────────────────────
test('MISSING_CREDENTIALS flag raised for engineer without SCE registration', async () => {
  const results = await service.suggestOccupationCode({
    skills: ['civil', 'engineering', 'construction', 'structural', 'design'],
    requisitionTitle: 'Civil Engineer',
  });
  const engineerResult = results.find(r => r.code === '2141');
  assert.ok(engineerResult, 'Civil Engineer (2141) must appear in results');
  assert.ok(
    engineerResult.validationFlags.includes('MISSING_CREDENTIALS'),
    'MISSING_CREDENTIALS flag expected when SCE credential not in skills'
  );
  assert.ok(engineerResult.missingCredentials.length > 0, 'missingCredentials array must be non-empty');
});

test('no MISSING_CREDENTIALS flag for codes with no required credentials', async () => {
  const results = await service.suggestOccupationCode({
    skills: ['software', 'programming', 'development', 'javascript'],
    requisitionTitle: 'Software Developer',
  });
  const swResult = results.find(r => r.code === '2512');
  assert.ok(swResult, 'Software Developer (2512) must appear');
  assert.ok(
    !swResult.validationFlags.includes('MISSING_CREDENTIALS'),
    'no credential required for 2512 — flag should not appear'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. validatePairing — valid pairings
// ─────────────────────────────────────────────────────────────────────────────
test('validatePairing returns valid:true for a non-prohibited code', () => {
  const report = service.validatePairing({
    candidateId:    'cand-001',
    roleId:         'role-001',
    occupationCode: '2512',
  });
  assert.equal(report.valid, true,   'Software Developer should be valid');
  assert.equal(report.code,  '2512', 'code must be echoed back');
  assert.ok(report.titleEN, 'titleEN must be set');
  assert.ok(report.titleAR, 'titleAR must be set');
  assert.ok(report.validatedAt, 'validatedAt must be set');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. validatePairing — prohibited blocks
// ─────────────────────────────────────────────────────────────────────────────
test('validatePairing returns valid:false for prohibited code 9991', () => {
  const report = service.validatePairing({
    candidateId:    'cand-002',
    roleId:         'role-002',
    occupationCode: '9991',
  });
  assert.equal(report.valid, false, 'prohibited code must be invalid');
  assert.ok(report.flags.includes('PROHIBITED_TITLE'), 'PROHIBITED_TITLE flag required');
});

test('validatePairing returns valid:false for prohibited code 9992', () => {
  const report = service.validatePairing({
    candidateId:    'cand-003',
    roleId:         'role-003',
    occupationCode: '9992',
  });
  assert.equal(report.valid, false);
  assert.ok(report.flags.includes('PROHIBITED_TITLE'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. validatePairing — unknown code
// ─────────────────────────────────────────────────────────────────────────────
test('validatePairing returns UNKNOWN_CODE flag for unrecognised code', () => {
  const report = service.validatePairing({
    candidateId:    'cand-004',
    roleId:         'role-004',
    occupationCode: '0000',
  });
  assert.equal(report.valid, false);
  assert.ok(report.flags.includes('UNKNOWN_CODE'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. validatePairing — missing required params throw
// ─────────────────────────────────────────────────────────────────────────────
test('validatePairing throws when candidateId is missing', () => {
  assert.throws(
    () => service.validatePairing({ roleId: 'r1', occupationCode: '2512' }),
    /candidateId/
  );
});

test('validatePairing throws when occupationCode is missing', () => {
  assert.throws(
    () => service.validatePairing({ candidateId: 'c1', roleId: 'r1' }),
    /occupationCode/
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. exportComplianceReport — structure
// ─────────────────────────────────────────────────────────────────────────────
test('exportComplianceReport returns html, filename, contentType, generatedAt', () => {
  const result = service.exportComplianceReport({
    candidateId:    'cand-exp-001',
    roleId:         'role-exp-001',
    occupationCode: '2512',
    candidateName:  'Ahmad Al-Rashid',
    roleTitle:      'Senior Software Developer',
    hrDecision:     'APPROVED',
  });
  assert.ok(typeof result.html === 'string' && result.html.length > 0, 'html must be non-empty string');
  assert.ok(typeof result.filename === 'string' && result.filename.endsWith('.html'), 'filename must be an .html file');
  assert.equal(result.contentType, 'text/html; charset=utf-8', 'contentType must be text/html');
  assert.ok(result.generatedAt, 'generatedAt must be set');
});

test('exportComplianceReport HTML contains candidateId and occupationCode', () => {
  const result = service.exportComplianceReport({
    candidateId:    'cand-html-check',
    roleId:         'role-html-check',
    occupationCode: '2411',
  });
  assert.ok(result.html.includes('cand-html-check'), 'html must contain candidateId');
  assert.ok(result.html.includes('2411'), 'html must contain occupationCode');
});

test('exportComplianceReport HTML contains Arabic content', () => {
  const result = service.exportComplianceReport({
    candidateId:    'cand-ar',
    roleId:         'role-ar',
    occupationCode: '2512',
  });
  // Arabic characters present (Software Developer titleAR: مطور برمجيات)
  assert.ok(/[\u0600-\u06FF]/.test(result.html), 'html must contain Arabic characters');
});

test('exportComplianceReport throws when candidateId is missing', () => {
  assert.throws(
    () => service.exportComplianceReport({ roleId: 'r1', occupationCode: '2512' }),
    /candidateId/
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Audit log service injection — fire-and-forget, no blocking
// ─────────────────────────────────────────────────────────────────────────────
test('service works correctly when auditLogService throws on write', async () => {
  const faultyAudit = {
    write: () => { throw new Error('audit log unavailable'); },
  };
  const svc = createOccupationCodeService({ config: policy, auditLogService: faultyAudit });
  // Must not throw — audit failure is non-blocking
  const results = await svc.suggestOccupationCode({
    skills: ['javascript', 'software'],
    requisitionTitle: 'Developer',
  });
  assert.ok(Array.isArray(results), 'must return results even when audit log fails');
});

test('service records suggestion in injected audit log when provided', async () => {
  const logged = [];
  const mockAudit = { write: (entry) => logged.push(entry) };
  const svc = createOccupationCodeService({ config: policy, auditLogService: mockAudit });
  await svc.suggestOccupationCode({
    skills: ['accounting', 'finance'],
    requisitionTitle: 'Accountant',
    tenantId: 'test-tenant',
    actorId:  'test-actor',
  });
  assert.ok(logged.length > 0, 'audit log must receive at least one write');
  assert.equal(logged[0].actionType, 'COMPLIANCE_HINT', 'actionType must be COMPLIANCE_HINT');
  assert.equal(logged[0].tenantId, 'test-tenant');
});
