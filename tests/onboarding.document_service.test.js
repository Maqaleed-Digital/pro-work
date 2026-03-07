'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createDocumentService, InMemoryDocumentStore } = require('../app/modules/onboarding/document_service');

function makeHooks() {
  const events = [];
  return { events, publish: async (e) => events.push(e) };
}

const BASE = {
  document_id:       '11111111-1111-1111-1111-111111111111',
  tenant_id:         '22222222-2222-2222-2222-222222222222',
  worker_id:         '33333333-3333-3333-3333-333333333333',
  onboarding_case_id:'44444444-4444-4444-4444-444444444444',
  document_type:     'IQAMA',
  created_at:        '2026-03-07T01:00:00Z',
};

describe('DocumentService — createDocument', () => {
  test('creates document with PENDING status', async () => {
    const h = makeHooks();
    const svc = createDocumentService({ store: new InMemoryDocumentStore(), hooks: h });
    const doc = await svc.createDocument(BASE);
    assert.equal(doc.verification_status, 'PENDING');
    assert.equal(doc.document_type, 'IQAMA');
    assert.equal(h.events.length, 0); // no event on create
  });

  test('rejects missing document_id', async () => {
    const svc = createDocumentService({ store: new InMemoryDocumentStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.createDocument({ ...BASE, document_id: '' }), /document_id is required/);
  });

  test('rejects missing worker_id', async () => {
    const svc = createDocumentService({ store: new InMemoryDocumentStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.createDocument({ ...BASE, worker_id: '' }), /worker_id is required/);
  });

  test('rejects missing document_type', async () => {
    const svc = createDocumentService({ store: new InMemoryDocumentStore(), hooks: makeHooks() });
    await assert.rejects(() => svc.createDocument({ ...BASE, document_type: '' }), /document_type is required/);
  });
});

describe('DocumentService — verifyDocument', () => {
  test('verifies document and emits DOCUMENT_VERIFIED', async () => {
    const h = makeHooks();
    const svc = createDocumentService({ store: new InMemoryDocumentStore(), hooks: h });
    await svc.createDocument(BASE);

    const updated = await svc.verifyDocument({
      document_id:     BASE.document_id,
      verified_by:     '55555555-5555-5555-5555-555555555555',
      verified_at:     '2026-03-07T01:30:00Z',
      event_id:        '66666666-6666-6666-6666-666666666666',
      occurred_at:     '2026-03-07T01:30:00Z',
      actor:           { actor_type: 'HUMAN', actor_id: '55555555-5555-5555-5555-555555555555' },
      correlation_id:  '77777777-7777-7777-7777-777777777777',
      causation_id:    '88888888-8888-8888-8888-888888888888',
      metadata:        {},
    });

    assert.equal(updated.verification_status, 'VERIFIED');
    assert.equal(h.events.length, 1);
    assert.equal(h.events[0].event_type, 'DOCUMENT_VERIFIED');
    assert.equal(h.events[0].trust_level, 'HIGH');
    assert.equal(h.events[0].requires_approval, true);
  });

  test('throws when document not found', async () => {
    const svc = createDocumentService({ store: new InMemoryDocumentStore(), hooks: makeHooks() });
    await assert.rejects(
      () => svc.verifyDocument({ document_id: 'missing', verified_by: 'u', verified_at: 'x' }),
      /document not found/,
    );
  });
});

describe('DocumentService — getDocument / listDocuments', () => {
  test('getDocument returns stored document', async () => {
    const svc = createDocumentService({ store: new InMemoryDocumentStore(), hooks: makeHooks() });
    await svc.createDocument(BASE);
    const doc = await svc.getDocument(BASE.document_id);
    assert.equal(doc.document_id, BASE.document_id);
  });

  test('getDocument returns null for unknown id', async () => {
    const svc = createDocumentService({ store: new InMemoryDocumentStore(), hooks: makeHooks() });
    assert.equal(await svc.getDocument('unknown'), null);
  });

  test('listDocuments returns all', async () => {
    const svc = createDocumentService({ store: new InMemoryDocumentStore(), hooks: makeHooks() });
    await svc.createDocument(BASE);
    await svc.createDocument({ ...BASE, document_id: 'doc-2' });
    const all = await svc.listDocuments();
    assert.equal(all.length, 2);
  });
});
