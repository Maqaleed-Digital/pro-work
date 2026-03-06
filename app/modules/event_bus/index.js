'use strict';

const crypto = require('crypto');
const { normalizeEnvelope } = require('./envelope');
const { validatePayload, getSchema } = require('./schema_registry');

class InMemoryEventStore {
  constructor() {
    this.rows = [];
  }

  async insert(event) {
    this.rows.push(event);
    return event;
  }

  async all() {
    return [...this.rows];
  }
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function createEventPublisher({ eventStore }) {
  if (!eventStore || typeof eventStore.insert !== 'function') {
    throw new Error('eventStore with insert(event) is required');
  }

  return {
    async publish(event) {
      const normalized = normalizeEnvelope(event);
      validatePayload(normalized.event_type, normalized.payload);

      const schema = getSchema(normalized.event_type);
      if (normalized.aggregate_type !== schema.aggregate_type) {
        throw new Error(`aggregate_type mismatch for ${normalized.event_type}`);
      }

      const persisted = {
        ...normalized,
        payload_hash: sha256(JSON.stringify(normalized.payload)),
        envelope_hash: sha256(JSON.stringify(normalized)),
        created_at: new Date().toISOString(),
      };

      await eventStore.insert(persisted);
      return persisted;
    },
  };
}

module.exports = {
  createEventPublisher,
  InMemoryEventStore,
  sha256,
};
