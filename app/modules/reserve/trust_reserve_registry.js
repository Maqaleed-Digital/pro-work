'use strict';

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('INVALID_NON_NEGATIVE_NUMBER');
  }
  return n;
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`INVALID_${field}`);
  }
  return value.trim();
}

class TrustReserveRegistry {
  constructor() {
    this.reserves = new Map();
    this.events = [];
  }

  createReserve(input) {
    const reserveId = requireText(input.reserve_id, 'RESERVE_ID');
    if (this.reserves.has(reserveId)) {
      throw new Error('RESERVE_ALREADY_EXISTS');
    }

    const record = {
      reserve_id: reserveId,
      network_id: requireText(input.network_id, 'NETWORK_ID'),
      jurisdiction_id: requireText(input.jurisdiction_id, 'JURISDICTION_ID'),
      reserve_type: requireText(input.reserve_type || 'GENERAL', 'RESERVE_TYPE'),
      reserve_status: requireText(input.reserve_status || 'ACTIVE', 'RESERVE_STATUS'),
      source_category: requireText(input.source_category || 'SYSTEM', 'SOURCE_CATEGORY'),
      total_balance: normalizeNumber(input.total_balance || 0),
      available_balance: normalizeNumber(
        input.available_balance != null ? input.available_balance : input.total_balance || 0
      ),
      locked_balance: normalizeNumber(input.locked_balance || 0),
      allocated_balance: normalizeNumber(input.allocated_balance || 0),
      utilization_ratio: 0,
      created_at: nowIso(),
      last_updated_at: nowIso()
    };

    this.#recalculate(record);
    this.reserves.set(reserveId, record);
    this.#recordEvent('RESERVE_CREATED', reserveId, { record: clone(record) });
    return clone(record);
  }

  getReserve(reserveId) {
    const found = this.reserves.get(requireText(reserveId, 'RESERVE_ID'));
    return found ? clone(found) : null;
  }

  listReserves() {
    return Array.from(this.reserves.values()).map(clone);
  }

  updateBalance(reserveId, totalBalance) {
    const record = this.#mustGet(reserveId);
    record.total_balance = normalizeNumber(totalBalance);
    if (record.available_balance > record.total_balance) {
      record.available_balance = record.total_balance;
    }
    this.#recalculate(record);
    this.#recordEvent('RESERVE_BALANCE_UPDATED', record.reserve_id, {
      total_balance: record.total_balance
    });
    return clone(record);
  }

  lockFunds(reserveId, amount) {
    const record = this.#mustGet(reserveId);
    const value = normalizeNumber(amount);
    if (record.available_balance < value) {
      throw new Error('INSUFFICIENT_AVAILABLE_BALANCE');
    }
    record.available_balance -= value;
    record.locked_balance += value;
    this.#recalculate(record);
    this.#recordEvent('RESERVE_FUNDS_LOCKED', record.reserve_id, { amount: value });
    return clone(record);
  }

  unlockFunds(reserveId, amount) {
    const record = this.#mustGet(reserveId);
    const value = normalizeNumber(amount);
    if (record.locked_balance < value) {
      throw new Error('INSUFFICIENT_LOCKED_BALANCE');
    }
    record.locked_balance -= value;
    record.available_balance += value;
    this.#recalculate(record);
    this.#recordEvent('RESERVE_FUNDS_UNLOCKED', record.reserve_id, { amount: value });
    return clone(record);
  }

  allocateFunds(reserveId, amount) {
    const record = this.#mustGet(reserveId);
    const value = normalizeNumber(amount);
    if (record.available_balance < value) {
      throw new Error('INSUFFICIENT_AVAILABLE_BALANCE');
    }
    record.available_balance -= value;
    record.allocated_balance += value;
    this.#recalculate(record);
    this.#recordEvent('RESERVE_FUNDS_ALLOCATED', record.reserve_id, { amount: value });
    return clone(record);
  }

  releaseAllocation(reserveId, amount) {
    const record = this.#mustGet(reserveId);
    const value = normalizeNumber(amount);
    if (record.allocated_balance < value) {
      throw new Error('INSUFFICIENT_ALLOCATED_BALANCE');
    }
    record.allocated_balance -= value;
    record.available_balance += value;
    this.#recalculate(record);
    this.#recordEvent('RESERVE_ALLOCATION_RELEASED', record.reserve_id, { amount: value });
    return clone(record);
  }

  setStatus(reserveId, reserveStatus) {
    const record = this.#mustGet(reserveId);
    record.reserve_status = requireText(reserveStatus, 'RESERVE_STATUS');
    this.#recalculate(record);
    this.#recordEvent('RESERVE_STATUS_UPDATED', record.reserve_id, {
      reserve_status: record.reserve_status
    });
    return clone(record);
  }

  getEvents() {
    return clone(this.events);
  }

  #mustGet(reserveId) {
    const record = this.reserves.get(requireText(reserveId, 'RESERVE_ID'));
    if (!record) {
      throw new Error('RESERVE_NOT_FOUND');
    }
    return record;
  }

  #recalculate(record) {
    const totalTracked = record.available_balance + record.locked_balance + record.allocated_balance;
    if (totalTracked > record.total_balance) {
      throw new Error('RESERVE_BALANCE_INVARIANT_VIOLATION');
    }
    record.utilization_ratio =
      record.total_balance === 0 ? 0 : Number((record.allocated_balance / record.total_balance).toFixed(6));
    record.last_updated_at = nowIso();
  }

  #recordEvent(eventType, reserveId, payload) {
    this.events.push({
      event_type: eventType,
      reserve_id: reserveId,
      occurred_at: nowIso(),
      payload: clone(payload)
    });
  }
}

module.exports = {
  TrustReserveRegistry
};
