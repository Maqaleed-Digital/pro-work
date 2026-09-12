'use strict';

/**
 * WC-007 — negative controls for the Stage B release guard.
 *
 * Every guard class is driven RED against a deterministic in-memory copy of the real
 * live `workcaptain:17` task definition. Nothing here touches AWS, and nothing writes
 * to the fixture: each control deep-copies before mutating, so fixture state is
 * restored by construction rather than by cleanup that could be skipped.
 *
 * A control that does not fire means the guard is NOT built. Fix the guard, not the test.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  RESPONSE_ONLY_FIELDS,
  cloneForRegistration,
  patchImage,
  diffGuard,
} = require('../../scripts/release/taskdef_release.js');

const FIXTURE = path.join(__dirname, 'fixtures', 'live-taskdef-17.json');
const LIVE = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).taskDefinition;
const CONTAINER = 'workcaptain';

const LIVE_DIGEST =
  'ghcr.io/maqaleed-digital/pro-work@sha256:82280b918462273b5a89533454f9d60cc7f9e1dc1b5086d542f18a0aeceb2514';
const NEW_DIGEST =
  'ghcr.io/maqaleed-digital/pro-work@sha256:1111111111111111111111111111111111111111111111111111111111111111';

const copy = (o) => JSON.parse(JSON.stringify(o));
const container = (td) => td.containerDefinitions.find((c) => c.name === CONTAINER);
const guard = (cand) => diffGuard(LIVE, cand, { containerName: CONTAINER, expectedNewImage: NEW_DIGEST });

/** The only legitimate release candidate: image patched, nothing else. */
function validCandidate() {
  return patchImage(cloneForRegistration(LIVE), CONTAINER, NEW_DIGEST);
}

test('fixture is the real live baseline', () => {
  assert.equal(LIVE.family, 'workcaptain');
  assert.equal(LIVE.revision, 17);
  assert.equal(container(LIVE).image, LIVE_DIGEST);
  assert.deepEqual(
    container(LIVE).secrets.map((s) => s.name).sort(),
    ['ADMIN_API_TOKEN', 'DATABASE_URL', 'JWT_SECRET']
  );
});

test('clone strips every response-only field, and strips nothing else', () => {
  const cloned = cloneForRegistration(LIVE);
  for (const f of RESPONSE_ONLY_FIELDS) {
    assert.ok(!(f in cloned), `${f} must not survive into a register input`);
  }
  // Copy-by-omission: every non-response-only live key must survive.
  for (const k of Object.keys(LIVE)) {
    if (!RESPONSE_ONLY_FIELDS.includes(k)) {
      assert.ok(k in cloned, `${k} must be carried forward, not dropped`);
    }
  }
  assert.equal(container(cloned).secrets.length, 3);
});

test('guard is non-vacuous — it compares a non-zero number of paths', () => {
  const r = guard(validCandidate());
  assert.ok(r.comparedPaths > 0, 'a guard that compared zero paths must never report clean');
  // Declared floor, same convention as scripts/ci_gate_tests.js: measured 39 leaves on
  // the real `workcaptain:17` document. Raising it is a deliberate act; a collapse below it
  // means the guard stopped comparing most of the task definition.
  assert.ok(r.comparedPaths >= 35, `comparedPaths collapsed to ${r.comparedPaths}; floor is 35`);
});

test('NC9 — image digest change ONLY: PASS', () => {
  const r = guard(validCandidate());
  assert.equal(r.pass, true, `expected PASS, findings: ${JSON.stringify(r.findings)}`);
  assert.equal(r.imageFrom, LIVE_DIGEST);
  assert.equal(r.imageTo, NEW_DIGEST);
});

test('NC10 — zero changes: FAIL (contract requires exactly one image delta)', () => {
  const r = guard(cloneForRegistration(LIVE));
  assert.equal(r.pass, false);
  assert.ok(r.findings.some((f) => /NO image delta/.test(f)), JSON.stringify(r.findings));
});

test('NC1 — one environment variable changed: FAIL', () => {
  const c = validCandidate();
  const env = container(c).environment.find((e) => e.name === 'NODE_ENV');
  env.value = 'staging';
  const r = guard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some((f) => /environment changed|FORBIDDEN delta/.test(f)), JSON.stringify(r.findings));
});

test('NC2 — one container secret dropped: FAIL', () => {
  const c = validCandidate();
  container(c).secrets = container(c).secrets.filter((s) => s.name !== 'ADMIN_API_TOKEN');
  const r = guard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some((f) => /secret COUNT changed: 3 -> 2/.test(f)), JSON.stringify(r.findings));
  assert.ok(r.findings.some((f) => /ADMIN_API_TOKEN is ABSENT/.test(f)), JSON.stringify(r.findings));
});

test('NC3 — taskRoleArn changed: FAIL', () => {
  const c = validCandidate();
  c.taskRoleArn = 'arn:aws:iam::822127611052:role/some-other-role';
  const r = guard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some((f) => /taskRoleArn changed/.test(f)), JSON.stringify(r.findings));
});

test('NC4 — healthCheck introduced where live has none: FAIL', () => {
  assert.equal(container(LIVE).healthCheck, undefined, 'precondition: live carries no healthCheck');
  const c = validCandidate();
  container(c).healthCheck = { command: ['CMD-SHELL', 'exit 0'], interval: 30, retries: 3 };
  const r = guard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some((f) => /healthCheck changed|FORBIDDEN delta/.test(f)), JSON.stringify(r.findings));
});

test('NC5 — repositoryCredentials ARN changed: FAIL', () => {
  const c = validCandidate();
  container(c).repositoryCredentials.credentialsParameter =
    'arn:aws:secretsmanager:eu-central-1:822127611052:secret:workcaptain/runtime/OTHER-XXXXXX';
  const r = guard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some((f) => /repositoryCredentials changed/.test(f)), JSON.stringify(r.findings));
});

test('NC6 — JWT_SECRET specifically dropped: FAIL, and named', () => {
  const c = validCandidate();
  container(c).secrets = container(c).secrets.filter((s) => s.name !== 'JWT_SECRET');
  const r = guard(c);
  assert.equal(r.pass, false);
  // This is the exact defect a stale-Terraform apply would produce. It must be
  // reported by NAME, not as an anonymous structural nuance.
  assert.ok(
    r.findings.some((f) => /REQUIRED secret JWT_SECRET is ABSENT/.test(f)),
    JSON.stringify(r.findings)
  );
});

test('NC7 — executionRoleArn changed: FAIL', () => {
  const c = validCandidate();
  c.executionRoleArn = 'arn:aws:iam::822127611052:role/workcaptain-ecs-execution-OTHER';
  const r = guard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some((f) => /executionRoleArn changed/.test(f)), JSON.stringify(r.findings));
});

test('NC8 — port mapping changed: FAIL', () => {
  const c = validCandidate();
  container(c).portMappings[0].containerPort = 8080;
  const r = guard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some((f) => /portMappings changed|FORBIDDEN delta/.test(f)), JSON.stringify(r.findings));
});

test('image must be pinned by immutable digest — a tag is refused', () => {
  assert.throws(
    () => patchImage(cloneForRegistration(LIVE), CONTAINER, 'ghcr.io/maqaleed-digital/pro-work:latest'),
    /immutable digest/
  );
});

test('patching an unknown container name is refused', () => {
  assert.throws(
    () => patchImage(cloneForRegistration(LIVE), 'not-a-container', NEW_DIGEST),
    /no container named/
  );
});

test('normalization tolerates reordering but never hides a real change', () => {
  // Pure reorder of order-insensitive arrays: still PASS.
  const reordered = validCandidate();
  container(reordered).secrets.reverse();
  container(reordered).environment.reverse();
  assert.equal(guard(reordered).pass, true, 'a pure reorder is not a semantic change');

  // Reorder AND a real edit: must still FAIL. Proves canonicalisation cannot be
  // used to smuggle a change past the guard.
  const smuggled = validCandidate();
  container(smuggled).secrets.reverse();
  container(smuggled).secrets.find((s) => s.name === 'DATABASE_URL').valueFrom =
    'arn:aws:secretsmanager:eu-central-1:822127611052:secret:workcaptain/runtime/EVIL-XXXXXX';
  const r = guard(smuggled);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some((f) => /DATABASE_URL valueFrom ARN changed/.test(f)), JSON.stringify(r.findings));
});

test('NC11 — a field no named invariant enumerates still FAILS via the structural diff', () => {
  // Perturbation showed the named invariants and the structural diff are largely
  // redundant for NC1-NC8. This control covers what ONLY the diff can catch: a field
  // nobody thought to enumerate. It is the reason the diff exists as a second layer —
  // the guard must refuse an unrecognised change rather than ignore it.
  const c = validCandidate();
  container(c).privileged = true;
  const r = guard(c);
  assert.equal(r.pass, false);
  assert.ok(
    r.findings.some((f) => /FORBIDDEN delta at containerDefinitions\[\d+\]\.privileged/.test(f)),
    JSON.stringify(r.findings)
  );

  const t = validCandidate();
  t.ipcMode = 'host';
  const r2 = guard(t);
  assert.equal(r2.pass, false);
  assert.ok(r2.findings.some((f) => /FORBIDDEN delta at ipcMode/.test(f)), JSON.stringify(r2.findings));
});
