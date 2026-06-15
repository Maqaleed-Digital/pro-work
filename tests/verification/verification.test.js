'use strict';
const test = require('node:test');
const assert = require('node:assert');
const verifyCredential = require('../../app/modules/verification/credential_verification_api');
const resolveCredential = require('../../app/modules/verification/public_credential_resolver');
const generateIdentityProof = require('../../app/modules/verification/identity_proof_endpoint');
const verificationKeys = require('../../app/modules/verification/verification_keys');
const createThirdPartyVerificationRequest = require('../../app/modules/verification/third_party_verification_gateway');

test('credential verification passes with required fields', () => {
  const result = verifyCredential({ credential_id: 'cred-1', ledger_reference: 'hash-1' });
  assert.equal(result.valid, true);
});

test('public credential resolver finds credential by id', () => {
  const result = resolveCredential(
    [{ credential_id: 'cred-1', subject: 'u1' }],
    'cred-1'
  );
  assert.equal(result.found, true);
  assert.equal(result.credential.subject, 'u1');
});

test('identity proof contains ledger reference', () => {
  const proof = generateIdentityProof({
    credential_id: 'cred-1',
    subject: 'u1',
    token_type: 'PROJECT_COMPLETION_TOKEN',
    ledger_reference: 'hash-1'
  });
  assert.equal(proof.ledger_reference, 'hash-1');
});

test('verification key registry stores key', () => {
  const result = verificationKeys.register('key-1', 'public-key-value');
  assert.equal(result.registered, true);
  assert.equal(verificationKeys.get('key-1'), 'public-key-value');
});

test('third party verification request contains verifier', () => {
  const request = createThirdPartyVerificationRequest(
    { credential_id: 'cred-1', ledger_reference: 'hash-1' },
    'external-verifier'
  );
  assert.equal(request.verifier, 'external-verifier');
});
