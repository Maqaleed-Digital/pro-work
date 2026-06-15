'use strict';
const test = require('node:test');
const assert = require('node:assert');
const linkIdentityToTrust = require('../../app/modules/identity/identity_trust_linker');
const projectLedgerEvents = require('../../app/modules/identity/ledger_identity_projection');
const exportCredential = require('../../app/modules/identity/verified_credential_export');
const buildIdentityAuditPack = require('../../app/modules/identity/identity_audit_pack');
const validateScope = require('../../app/modules/identity/reputation_scope_guard');

test('identity token links to ledger hash', () => {
  const link = linkIdentityToTrust(
    { token_id: 'tok1' },
    { ledger_hash: 'abc123' }
  );
  assert.equal(link.ledger_hash, 'abc123');
});

test('ledger events project credentials', () => {
  const creds = projectLedgerEvents([
    { type: 'PROJECT_COMPLETED', user_id: 'u1', event_id: 'e1' }
  ]);
  assert.equal(creds.length, 1);
});

test('credential export contains ledger reference', () => {
  const cred = exportCredential(
    { token_id: 't1', owner_user_id: 'u1', token_type: 'PROJECT_COMPLETION_TOKEN', issued_at: 'now' },
    { ledger_hash: 'hash1' }
  );
  assert.equal(cred.ledger_reference, 'hash1');
});

test('audit pack counts tokens', () => {
  const pack = buildIdentityAuditPack([{ id: 1 }, { id: 2 }]);
  assert.equal(pack.token_count, 2);
});

test('cross tenant reputation blocked', () => {
  const result = validateScope('tenantA', 'tenantB');
  assert.equal(result.allowed, false);
});
