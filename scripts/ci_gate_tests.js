#!/usr/bin/env node
'use strict';

/**
 * CI gate-test runner.
 *
 * The defect this exists to close: the repository's gate assertions live in the
 * root tests/ directory, and no CI job ran them. `npm test` in ci.yml resolves to
 * app/package.json's "node --test frontend/src/components/__tests__/" — three
 * component files. tests/cwv.ci_gate.test.js, tests/wcag.ci_gate.test.js and the
 * security-header tests were never executed by CI at all. They passed locally and
 * proved nothing about any pushed commit.
 *
 * This runner executes a DECLARED manifest of gate suites and refuses to report
 * success unless it can show the assertions that actually ran:
 *
 *   - every declared file must exist        (a renamed/deleted gate is a failure,
 *                                            never a silent skip)
 *   - the run must report a non-zero test count
 *   - zero failures
 *
 * Exit 0 only when all three hold. Exit 1 otherwise.
 */

const fs    = require('fs');
const path  = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// The gate manifest. Adding a gate suite here is what puts it on the CI critical
// path — leaving it out means it does not run, so keep this list honest.
const GATE_TESTS = [
  'tests/cwv.ci_gate.test.js',
  'tests/wcag.ci_gate.test.js',
  'tests/security/security_headers.test.js',
  'tests/security/route_guard.test.js',
  'tests/security/route_auth_dispatch.test.js',
  'tests/security/workflow_injection.test.js',
  'tests/security/workflow_trust_boundary.test.js',
  'tests/security/invoices_rls_migration.test.js',
  'tests/security/csp_origin_parity.test.js',
  'tests/security/scanner_positive_controls.test.js',
  'tests/release/taskdef_release_guard.test.js',
  'tests/release/release_manifest.test.js',
  'tests/security/env_contract.test.js',
  'tests/security/release_path_guard.test.js',
];

// A run reporting fewer than this many assertions is treated as broken wiring
// rather than a pass, regardless of what the exit code says.
// Raised 185 -> 211 when tests/security/workflow_trust_boundary.test.js (26 assertions) joined
// the manifest. The floor moves with the manifest, preserving the same 7-assertion slack the
// previous value carried; leaving it at 185 would have let the new suite disappear from a run
// without the floor noticing.
// Raised 211 -> 228 when tests/release/taskdef_release_guard.test.js (17 assertions) joined the
// manifest for WC-007. Same 7-assertion slack preserved: measured 235, floor 228.
// Raised 228 -> 240 when tests/release/release_manifest.test.js (12 assertions) joined for
// WC-007 Stage A. Same 7-assertion slack preserved: measured 247, floor 240.
// Raised 240 -> 246 after merging main: the WAAP D2 App-credential migration strengthened two
// suites already on the manifest (workflow_injection 35 -> 38, workflow_trust_boundary 26 -> 29,
// +6). Measured 253, floor 246 — same 7-assertion slack. The floor is moved because the corpus
// grew, not to make a run pass.
// Raised 246 -> 273 for WC-012: tests/security/env_contract.test.js (16 assertions) joined the
// manifest and the WC-007 guard suite grew by 11 for the ENV_ADDITION_ONLY profile controls.
// Measured 280, floor 273 — same 7-assertion slack.
// Raised 273 -> 286 for WC-011: tests/security/release_path_guard.test.js (13 assertions)
// joined the manifest. Measured 293, floor 286 — same 7-assertion slack.
const MIN_EXPECTED_TESTS = 286;

function fail(msg) {
  console.error(`\nERROR: ${msg}`);
  console.error('CI GATE TESTS: FAIL');
  process.exit(1);
}

console.log('┌─ CI gate tests ───────────────────────────────────────────────');
console.log(`│  Suites declared : ${GATE_TESTS.length}`);
console.log(`│  Minimum tests   : ${MIN_EXPECTED_TESTS}`);
console.log('└──────────────────────────────────────────────────────────────\n');

// ── 1. Every declared gate file must exist ───────────────────────────────────
const missing = GATE_TESTS.filter(f => !fs.existsSync(path.join(ROOT, f)));
if (missing.length > 0) {
  missing.forEach(f => console.error(`  MISSING gate suite: ${f}`));
  fail(`${missing.length} declared gate suite(s) do not exist. A gate that cannot ` +
       'run is a failure, not a skip.');
}
GATE_TESTS.forEach(f => console.log(`  declared: ${f}`));
console.log();

// ── 2. Run them ──────────────────────────────────────────────────────────────
const run = spawnSync(process.execPath, ['--test', ...GATE_TESTS], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, NODE_ENV: 'test' },
  maxBuffer: 64 * 1024 * 1024,
});

const out = `${run.stdout || ''}${run.stderr || ''}`;
process.stdout.write(out);

if (run.error) fail(`could not run the gate suites: ${run.error.message}`);

// ── 3. Prove a non-zero assertion set actually ran ───────────────────────────
const num = re => {
  const m = out.match(re);
  return m ? Number(m[1]) : null;
};
const totalTests = num(/^# tests (\d+)$/m);
const passed     = num(/^# pass (\d+)$/m);
const failed     = num(/^# fail (\d+)$/m);

console.log('\n' + '─'.repeat(62));
console.log(`Suites declared : ${GATE_TESTS.length}`);
console.log(`Tests reported  : ${totalTests === null ? 'NONE — no TAP summary' : totalTests}`);
console.log(`Passed          : ${passed === null ? 'unknown' : passed}`);
console.log(`Failed          : ${failed === null ? 'unknown' : failed}`);
console.log(`Runner exit     : ${run.status}`);

if (totalTests === null || passed === null || failed === null) {
  fail('the test runner produced no parsable TAP summary — cannot certify that ' +
       'anything ran.');
}
if (totalTests === 0) {
  fail('the gate run executed 0 tests. A harness that exits having evaluated ' +
       'nothing is a FAILURE, not a pass.');
}
if (totalTests < MIN_EXPECTED_TESTS) {
  fail(`only ${totalTests} tests ran, below the ${MIN_EXPECTED_TESTS} expected. ` +
       'Gate wiring has regressed.');
}
if (failed > 0) fail(`${failed} gate test(s) failed.`);
if (run.status !== 0) fail(`test runner exited ${run.status}.`);

console.log(`\nCI GATE TESTS: PASS — ${passed} assertions ran across ` +
            `${GATE_TESTS.length} declared gate suites.`);
process.exit(0);
