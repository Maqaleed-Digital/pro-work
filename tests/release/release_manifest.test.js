'use strict';

/**
 * WC-007 Stage A — release manifest contract tests.
 *
 * The manifest is the Stage A -> Stage B handoff. Stage B patches a live task
 * definition to whatever digest this manifest names, and the Stage B guard will
 * faithfully prove "exactly one semantic delta" even if that digest is wrong.
 * So the manifest's own validation has to be the thing that refuses a bad identity.
 *
 * Every control below drives a rejection path. No network, no AWS, no Docker.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SCHEMA_VERSION,
  REQUIRED_FIELDS,
  build,
  validate,
  checkedFieldCount,
} = require('../../scripts/release/release_manifest.js');

const DIGEST = 'sha256:82280b918462273b5a89533454f9d60cc7f9e1dc1b5086d542f18a0aeceb2514';
const SHA = 'ff9f1e7ef918cc633439bca6b345384d3fe1dcbf';

const good = () => build({
  repository: 'Maqaleed-Digital/pro-work',
  source_commit_sha: SHA,
  source_ref: 'refs/heads/main',
  workflow_run_id: '34687068442',
  workflow_run_url: 'https://github.com/Maqaleed-Digital/pro-work/actions/runs/34687068442',
  image_repository: 'ghcr.io/maqaleed-digital/pro-work',
  image_digest: DIGEST,
  build_timestamp_utc: '2026-09-12T11:20:00Z',
  builder_identity: 'github-actions[bot] via github.token',
  dockerfile_path: 'infrastructure/docker/Dockerfile',
});

test('a well-formed manifest validates, and validation is not vacuous', () => {
  const m = good();
  assert.deepEqual(validate(m), []);
  assert.equal(m.schema_version, SCHEMA_VERSION);
  // A validator that checked nothing would also return []. Prove it checks a real set.
  assert.ok(checkedFieldCount() >= 11, `only ${checkedFieldCount()} required fields declared`);
  assert.equal(REQUIRED_FIELDS.length, checkedFieldCount());
});

test('image_ref_by_digest is derived, never supplied', () => {
  assert.equal(good().image_ref_by_digest, `ghcr.io/maqaleed-digital/pro-work@${DIGEST}`);
});

test('every required field is individually load-bearing', () => {
  // Drops each required field in turn. If any one could go missing without a
  // finding, the required-field list would be decorative.
  for (const field of REQUIRED_FIELDS) {
    const m = good();
    delete m[field];
    const f = validate(m);
    assert.ok(
      f.some((x) => x.includes(field)),
      `dropping ${field} produced no finding: ${JSON.stringify(f)}`
    );
  }
});

test('NC-A1 — a tag instead of a digest is REFUSED', () => {
  const m = good();
  m.image_digest = 'latest';
  m.image_ref_by_digest = 'ghcr.io/maqaleed-digital/pro-work:latest';
  const f = validate(m);
  assert.ok(f.some((x) => /image_digest must be sha256/.test(x)), JSON.stringify(f));
  assert.ok(f.some((x) => /must be pinned by digest/.test(x)), JSON.stringify(f));
});

test('NC-A2 — a tagged image_repository is REFUSED', () => {
  const m = good();
  m.image_repository = 'ghcr.io/maqaleed-digital/pro-work:v1.2.3';
  assert.ok(validate(m).some((x) => /must not carry a tag/.test(x)));
});

test('NC-A3 — image_ref_by_digest inconsistent with its parts is REFUSED', () => {
  // The exact smuggling route: a plausible ref naming a DIFFERENT digest.
  const m = good();
  m.image_ref_by_digest = 'ghcr.io/maqaleed-digital/pro-work@sha256:' + '0'.repeat(64);
  assert.ok(validate(m).some((x) => /does not equal image_repository@image_digest/.test(x)));
});

test('NC-A4 — a short/abbreviated commit sha is REFUSED', () => {
  const m = good();
  m.source_commit_sha = 'ff9f1e7';
  assert.ok(validate(m).some((x) => /full 40-hex commit sha/.test(x)));
});

test('NC-A5 — a non-UTC or malformed build timestamp is REFUSED', () => {
  for (const bad of ['2026-09-12 11:20:00', '2026-09-12T11:20:00+03:00', 'yesterday']) {
    const m = good();
    m.build_timestamp_utc = bad;
    assert.ok(validate(m).some((x) => /ISO-8601 UTC/.test(x)), `accepted: ${bad}`);
  }
});

test('NC-A6 — a wrong schema_version is REFUSED', () => {
  const m = good();
  m.schema_version = 99;
  assert.ok(validate(m).some((x) => /schema_version must be/.test(x)));
});

test('NC-A7 — a malformed digest length is REFUSED', () => {
  const m = good();
  m.image_digest = 'sha256:abc123';
  m.image_ref_by_digest = `ghcr.io/maqaleed-digital/pro-work@${m.image_digest}`;
  assert.ok(validate(m).some((x) => /image_digest must be sha256/.test(x)));
});

test('validate reports EVERY problem, not just the first', () => {
  const m = good();
  m.schema_version = 99;
  m.source_commit_sha = 'short';
  m.image_digest = 'nope';
  const f = validate(m);
  assert.ok(f.length >= 3, `expected multiple findings, got ${JSON.stringify(f)}`);
});

test('a non-object manifest is refused rather than throwing', () => {
  assert.ok(validate(null).length > 0);
  assert.ok(validate('a string').length > 0);
});
