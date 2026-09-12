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

// ── WC-012: ENV_ADDITION_ONLY profile controls ───────────────────────────────
//
// The HSTS closure needs a different single delta from an image release. These controls
// prove the profile is a NARROW enumeration, not a door left open for "environment changes".

const { envAdditionGuard, RELEASE_PROFILES } = require('../../scripts/release/taskdef_release.js');

const TP = [{ name: 'TRUSTED_PROXY', value: '1' }];
const envCandidate = () => {
  const c = cloneForRegistration(LIVE);
  container(c).environment.push({ name: 'TRUSTED_PROXY', value: '1' });
  return c;
};
const envGuard = (cand, permitted = TP) =>
  envAdditionGuard(LIVE, cand, { containerName: CONTAINER, permittedAdditions: permitted });

test('profiles are enumerated, not free-form', () => {
  // Adding a profile is a deliberate, reviewable act. This assertion failing on a new profile
  // is the control working: it forces the addition to be acknowledged here rather than
  // appearing silently.
  assert.deepEqual(Object.keys(RELEASE_PROFILES).sort(),
    ['ENV_ADDITION_ONLY', 'IMAGE_ONLY', 'REGISTRY_MIGRATION']);
});

test('NC-P1 — exactly the permitted env addition, image unchanged: PASS', () => {
  const r = envGuard(envCandidate());
  assert.equal(r.pass, true, `expected PASS, findings: ${JSON.stringify(r.findings)}`);
  assert.ok(r.comparedPaths > 0, 'a guard that compared nothing must not report clean');
  assert.deepEqual(r.permittedDeltas, ['environment.TRUSTED_PROXY=1']);
});

test('NC-P2 — image changed under ENV_ADDITION_ONLY: FAIL', () => {
  // A release must not change configuration and code together; a failure could not be attributed.
  const c = envCandidate();
  container(c).image = NEW_DIGEST;
  const r = envGuard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /image changed under ENV_ADDITION_ONLY/.test(f)), JSON.stringify(r.findings));
});

test('NC-P3 — a SECOND environment addition: FAIL', () => {
  const c = envCandidate();
  container(c).environment.push({ name: 'SOMETHING_ELSE', value: 'x' });
  const r = envGuard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /FORBIDDEN environment addition: SOMETHING_ELSE/.test(f)), JSON.stringify(r.findings));
});

test('NC-P4 — an existing environment value changed: FAIL', () => {
  const c = envCandidate();
  container(c).environment.find(e => e.name === 'NODE_ENV').value = 'staging';
  const r = envGuard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /FORBIDDEN environment change: NODE_ENV/.test(f)), JSON.stringify(r.findings));
});

test('NC-P5 — an environment removal: FAIL', () => {
  const c = envCandidate();
  container(c).environment = container(c).environment.filter(e => e.name !== 'PUBLIC_BASE_URL');
  const r = envGuard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /FORBIDDEN environment removal: PUBLIC_BASE_URL/.test(f)), JSON.stringify(r.findings));
});

test('NC-P6 — permitted variable added with the WRONG value: FAIL', () => {
  const c = cloneForRegistration(LIVE);
  container(c).environment.push({ name: 'TRUSTED_PROXY', value: 'true' });
  const r = envGuard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /permitted value is "1"/.test(f)), JSON.stringify(r.findings));
  // 'true' is accepted by the CODE but this release enumerates '1'. The profile pins the
  // exact transition that was reviewed, not everything the code would tolerate.
});

test('NC-P7 — secrets still guarded under the env profile: FAIL', () => {
  const c = envCandidate();
  container(c).secrets = container(c).secrets.filter(s => s.name !== 'JWT_SECRET');
  const r = envGuard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /REQUIRED secret JWT_SECRET is ABSENT/.test(f)), JSON.stringify(r.findings));
});

test('NC-P8 — a non-environment field changed under the env profile: FAIL', () => {
  const c = envCandidate();
  c.taskRoleArn = 'arn:aws:iam::822127611052:role/other';
  const r = envGuard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /taskRoleArn changed/.test(f)), JSON.stringify(r.findings));
});

test('NC-P9 — an empty permitted set is REFUSED, not treated as "allow anything"', () => {
  const r = envGuard(envCandidate(), []);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /refusing an open-ended env change/.test(f)), JSON.stringify(r.findings));
});

test('NC-P10 — no addition made at all: FAIL (the profile requires its enumerated delta)', () => {
  const r = envGuard(cloneForRegistration(LIVE));
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /permitted addition TRUSTED_PROXY is not present/.test(f)), JSON.stringify(r.findings));
});

// ── WC-010 / DL-WC-ECR-AUTH-001: REGISTRY_MIGRATION controls ─────────────────
//
// Digest equality is a REQUIRED PREDICATE, not an allowed delta. These controls exist to make
// "we copied the artifact" structurally distinguishable from "we rebuilt something similar".

const { registryMigrationGuard, splitImageRef } = require('../../scripts/release/taskdef_release.js');

const ECR_REPO = '822127611052.dkr.ecr.eu-central-1.amazonaws.com/workcaptain-production';
const LIVE_DIGEST_FIXTURE = 'sha256:82280b918462273b5a89533454f9d60cc7f9e1dc1b5086d542f18a0aeceb2514';

/** The one legitimate migration candidate: same digest, ECR repo, credentials removed. */
function migrationCandidate() {
  const c = cloneForRegistration(LIVE);
  const cd = container(c);
  cd.image = `${ECR_REPO}@${LIVE_DIGEST_FIXTURE}`;
  delete cd.repositoryCredentials;
  return c;
}
const migGuard = (cand, over = {}) => registryMigrationGuard(LIVE, cand, {
  containerName: CONTAINER,
  approvedTargetRepository: ECR_REPO,
  approvedDigest: LIVE_DIGEST_FIXTURE,
  ...over,
});

test('splitImageRef parses digest-pinned refs and refuses tags', () => {
  assert.deepEqual(splitImageRef(`${ECR_REPO}@${LIVE_DIGEST_FIXTURE}`),
    { repository: ECR_REPO, digest: LIVE_DIGEST_FIXTURE });
  assert.equal(splitImageRef(`${ECR_REPO}:latest`), null);
  assert.equal(splitImageRef(''), null);
});

test('NC-ECR-09 — GHCR→approved ECR, same digest, credentials removed: PASS', () => {
  const r = migGuard(migrationCandidate());
  assert.equal(r.pass, true, `expected PASS, findings: ${JSON.stringify(r.findings)}`);
  assert.equal(r.digestPreserved, true);
  assert.equal(r.permittedDeltas.length, 2);
  assert.ok(r.comparedPaths > 0, 'a guard that compared nothing must never report clean');
});

test('NC-ECR-01 — target digest differs: FAIL (the rebuild trap)', () => {
  const c = migrationCandidate();
  container(c).image = `${ECR_REPO}@sha256:${'1'.repeat(64)}`;
  const r = migGuard(c);
  assert.equal(r.pass, false);
  assert.equal(r.digestPreserved, false);
  assert.ok(r.findings.some(f => /DIGEST CHANGED/.test(f)), JSON.stringify(r.findings));
  assert.ok(r.findings.some(f => /Do not rebuild — copy/.test(f)),
    'the finding must say WHY, so a rebuild is not mistaken for an acceptable variation');
});

test('NC-ECR-02 — ECR image referenced by mutable tag: FAIL', () => {
  const c = migrationCandidate();
  container(c).image = `${ECR_REPO}:latest`;
  const r = migGuard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /not digest-pinned/.test(f)), JSON.stringify(r.findings));
});

test('NC-ECR-03 — repositoryCredentials retained: FAIL', () => {
  const c = migrationCandidate();
  container(c).repositoryCredentials = container(LIVE).repositoryCredentials;
  const r = migGuard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /RETAINED/.test(f)), JSON.stringify(r.findings));
});

test('NC-ECR-04 — repositoryCredentials swapped for another credential: FAIL', () => {
  const c = migrationCandidate();
  container(c).repositoryCredentials = {
    credentialsParameter: 'arn:aws:secretsmanager:eu-central-1:822127611052:secret:workcaptain/runtime/OTHER-XXXXXX',
  };
  const r = migGuard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /CHANGED to another credential/.test(f)), JSON.stringify(r.findings));
});

test('NC-ECR-05 — environment altered: FAIL', () => {
  const c = migrationCandidate();
  container(c).environment.find(e => e.name === 'NODE_ENV').value = 'staging';
  assert.equal(migGuard(c).pass, false);
});

test('NC-ECR-06 — a secret dropped: FAIL', () => {
  const c = migrationCandidate();
  container(c).secrets = container(c).secrets.filter(s => s.name !== 'JWT_SECRET');
  const r = migGuard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /REQUIRED secret JWT_SECRET is ABSENT/.test(f)), JSON.stringify(r.findings));
});

test('NC-ECR-07 — task/execution role altered: FAIL', () => {
  for (const key of ['taskRoleArn', 'executionRoleArn']) {
    const c = migrationCandidate();
    c[key] = 'arn:aws:iam::822127611052:role/other';
    const r = migGuard(c);
    assert.equal(r.pass, false, `${key} could change without a finding`);
    assert.ok(r.findings.some(f => f.includes(key)), `finding did not name ${key}`);
  }
});

test('NC-ECR-08 — healthCheck altered: FAIL', () => {
  const c = migrationCandidate();
  container(c).healthCheck = { command: ['CMD-SHELL', 'exit 0'] };
  assert.equal(migGuard(c).pass, false);
});

test('an unapproved target registry is REFUSED even with the digest preserved', () => {
  // "It changed registry" is not the predicate. It must change to THE approved repository.
  const c = migrationCandidate();
  container(c).image = `999999999999.dkr.ecr.eu-central-1.amazonaws.com/someone-else@${LIVE_DIGEST_FIXTURE}`;
  const r = migGuard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /not the approved ECR repository/.test(f)), JSON.stringify(r.findings));
});

test('an empty approved target is REFUSED, not treated as "any registry"', () => {
  const r = migGuard(migrationCandidate(), { approvedTargetRepository: undefined });
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /open-ended registry change/.test(f)), JSON.stringify(r.findings));
});

test('NC-ECR-10 — the default IMAGE_ONLY profile REJECTS the migration candidate', () => {
  const r = diffGuard(LIVE, migrationCandidate(), { containerName: CONTAINER });
  assert.equal(r.pass, false, 'IMAGE_ONLY must not accept a repositoryCredentials removal');
});

test('NC-ECR-11 — ENV_ADDITION_ONLY REJECTS the migration candidate', () => {
  const r = envAdditionGuard(LIVE, migrationCandidate(), {
    containerName: CONTAINER, permittedAdditions: TP,
  });
  assert.equal(r.pass, false, 'ENV_ADDITION_ONLY must not accept an image/registry change');
});

test('NC-ECR-12 — a field no named invariant enumerates FAILS via the structural diff', () => {
  // Perturbation showed the named invariants alone caught every other control, leaving the
  // REGISTRY_MIGRATION structural diff unexercised. This covers what ONLY the diff can catch:
  // a field nobody thought to enumerate. Without it the diff layer would be decorative here,
  // exactly as it nearly was for IMAGE_ONLY before NC11.
  const c = migrationCandidate();
  container(c).privileged = true;
  const r = migGuard(c);
  assert.equal(r.pass, false);
  assert.ok(r.findings.some(f => /FORBIDDEN delta at containerDefinitions\[\d+\]\.privileged/.test(f)),
    JSON.stringify(r.findings));

  const t = migrationCandidate();
  t.ipcMode = 'host';
  const r2 = migGuard(t);
  assert.equal(r2.pass, false);
  assert.ok(r2.findings.some(f => /FORBIDDEN delta at ipcMode/.test(f)), JSON.stringify(r2.findings));
});
