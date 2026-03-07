'use strict';
const test = require('node:test');
const assert = require('node:assert');
const registry = require('../../app/modules/verification/verifier_policy_registry');
const resolveExternal = require('../../app/modules/verification/external_resolver_adapters');
const checkAccess = require('../../app/modules/verification/verification_access_policy');
const revocationRegistry = require('../../app/modules/verification/credential_revocation_registry');
const logVerification = require('../../app/modules/verification/partner_verification_audit');

test('policy registry registers verifier policy', () => {
  const result = registry.register('verifier1', { allowed_verifiers: ['verifier1'] });
  assert.equal(result.registered, true);
});

test('external resolver returns adapter reference', () => {
  const result = resolveExternal('adapterA', { credential_id: 'cred-1', ledger_reference: 'hash-1' });
  assert.equal(result.adapter, 'adapterA');
});

test('verification access allowed when verifier listed', () => {
  const policy = { allowed_verifiers: ['verifierX'] };
  const result = checkAccess(policy, { verifier: 'verifierX' });
  assert.equal(result.allowed, true);
});

test('credential revocation registry tracks revocation', () => {
  revocationRegistry.revoke('cred-1');
  assert.equal(revocationRegistry.isRevoked('cred-1'), true);
});

test('partner verification audit returns verifier', () => {
  const result = logVerification('verifierA', 'cred-1');
  assert.equal(result.verifier, 'verifierA');
});
