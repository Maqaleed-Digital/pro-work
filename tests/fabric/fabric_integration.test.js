'use strict';
const test = require('node:test');
const assert = require('node:assert');
const trustRegistry = require('../../app/modules/fabric/federated_trust_registry');
const resolveAcrossFabric = require('../../app/modules/fabric/cross_platform_credential_resolver');
const verifierRegistry = require('../../app/modules/fabric/federated_verifier_registry');
const generateGlobalProof = require('../../app/modules/fabric/global_proof_generator');
const executeFabricRequest = require('../../app/modules/fabric/trust_fabric_adapter');

test('trust registry registers node', () => {
  const result = trustRegistry.register('nodeA', 'https://nodeA.example');
  assert.equal(result.registered, true);
});

test('cross platform resolver returns node reference', () => {
  const result = resolveAcrossFabric('nodeA', 'cred-1');
  assert.equal(result.node, 'nodeA');
});

test('federated verifier registry registers verifier', () => {
  const result = verifierRegistry.register('verifierA', 'https://verify.example');
  assert.equal(result.registered, true);
});

test('global proof generator marks global scope', () => {
  const proof = generateGlobalProof({ credential_id: 'cred-1', ledger_reference: 'hash-1' });
  assert.equal(proof.proof_scope, 'global');
});

test('fabric adapter returns endpoint', () => {
  const result = executeFabricRequest('https://node.example', { credential_id: 'cred-1' });
  assert.equal(result.endpoint, 'https://node.example');
});
