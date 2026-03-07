'use strict';

class TenantService {

  constructor() {
    this.tenants = new Map();
  }

  createTenant(id, name) {
    if (this.tenants.has(id)) {
      return { created: false, reason: 'tenant exists' };
    }
    this.tenants.set(id, {
      id,
      name,
      created_at: new Date().toISOString()
    });
    return { created: true };
  }

  getTenant(id) {
    return this.tenants.get(id);
  }

}

module.exports = new TenantService();
