'use strict';
const test = require('node:test');
const assert = require('node:assert');
const compliance = require('../../app/modules/compliance/compliance_service');
const wps = require('../../app/modules/compliance/wps_validator');

test('occupation validation', () => {
  const result = compliance.validateOccupationCode('engineer', 'ENG');
  assert.equal(result.valid, true);
});

test('wps validation', () => {
  const result = wps.validate({ iban: 'SA000000', salary: 5000 });
  assert.equal(result.valid, true);
});
