#!/usr/bin/env node
'use strict';

// Asserts the VERITAS forwarder whitelist is EXACTLY the Sponsor-approved set.
// Fails on silent additions (leak risk per the Sponsor Ruling) as well as
// removals. Wired into .github/workflows/veritas_forwarder_gate.yml; also
// runnable locally: `node scripts/veritas_whitelist_check.js`.

const { WHITELIST } = require('../app/modules/event_bus/veritas/contract');

const APPROVED = ['ONBOARDING_STARTED', 'CANDIDATE_MATCHED', 'CANDIDATE_SHORTLISTED'];

const actual = Object.keys(WHITELIST).sort();
const want   = APPROVED.slice().sort();

const missing = want.filter(k => !actual.includes(k));
const extra   = actual.filter(k => !want.includes(k));

if (missing.length === 0 && extra.length === 0) {
  console.log(`PASS: VERITAS forwarder whitelist matches approved set exactly: [${actual.join(', ')}]`);
  process.exit(0);
}

if (missing.length) {
  console.error(`FAIL: WHITELIST is missing approved event types: [${missing.join(', ')}]`);
}
if (extra.length) {
  console.error(`FAIL: WHITELIST contains UNAPPROVED event types (leak risk per Sponsor Ruling): [${extra.join(', ')}]`);
  console.error('       Sponsor Ruling: "fail on silent additions ... as well as removals."');
  console.error('       Either remove these or obtain a new Sponsor Ruling extending the approved set.');
}
process.exit(1);
