'use strict';
const test = require('node:test');
const assert = require('node:assert');
const tenantService = require('../../app/modules/tenant/tenant_service');
const rbac = require('../../app/modules/rbac/rbac_service');

test('tenant creation', () => {
  const result = tenantService.createTenant('t1', 'example');
  assert.equal(result.created, true);
});

test('rbac assignment', () => {
  rbac.assignRole('u1', 'TENANT_ADMIN');
  assert.equal(rbac.checkAccess('u1', 'TENANT_ADMIN'), true);
});
