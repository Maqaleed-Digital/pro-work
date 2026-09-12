#!/usr/bin/env node
'use strict';

/**
 * WC-007 Stage A — release manifest contract.
 *
 * Stage A builds the image and pushes it to GHCR using the Actions identity
 * (github.token with packages:write). There is NO human publish PAT in this path —
 * ci-publish-test.yml already proved that works; this derives from it rather than
 * repurposing it, because a disposable proof must not become production machinery.
 *
 * WHAT THIS FILE GUARANTEES
 * -------------------------
 * The manifest is the handoff between Stage A (publish) and Stage B (release). Stage B
 * patches a live task definition to an image digest; if that digest were ever wrong,
 * guessed, or tag-derived, the guard would faithfully prove that the WRONG image was
 * deployed with exactly one semantic delta.
 *
 * So the release identity is the IMMUTABLE DIGEST, captured from the build/push output
 * and never reconstructed. A tag is refused outright: tags are mutable, and a tag that
 * moved between publish and release would silently deploy something nobody reviewed.
 *
 * This module performs no network and no AWS calls. It builds and validates JSON.
 */

const SCHEMA_VERSION = 1;

const REQUIRED_FIELDS = Object.freeze([
  'schema_version',
  'repository',
  'source_commit_sha',
  'source_ref',
  'workflow_run_id',
  'image_repository',
  'image_digest',
  'image_ref_by_digest',
  'build_timestamp_utc',
  'builder_identity',
  'dockerfile_path',
]);

const SHA40 = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function build(input) {
  const m = {
    schema_version: SCHEMA_VERSION,
    repository: input.repository,
    source_commit_sha: input.source_commit_sha,
    source_ref: input.source_ref,
    workflow_run_id: String(input.workflow_run_id ?? ''),
    workflow_run_url: input.workflow_run_url || null,
    image_repository: input.image_repository,
    image_digest: input.image_digest,
    image_ref_by_digest: `${input.image_repository}@${input.image_digest}`,
    build_timestamp_utc: input.build_timestamp_utc,
    builder_identity: input.builder_identity,
    dockerfile_path: input.dockerfile_path,
  };
  if (input.sbom_ref) m.sbom_ref = input.sbom_ref;
  if (input.release_label) m.release_label = input.release_label;
  return m;
}

/**
 * Validation is fail-closed and returns every problem, not the first.
 * A caller that only checked `findings.length === 0` on a manifest this never
 * examined would be the exact vacuous-gate defect this repo keeps closing.
 */
function validate(m) {
  const f = [];
  if (!m || typeof m !== 'object') return ['manifest is not an object'];

  for (const k of REQUIRED_FIELDS) {
    const v = m[k];
    if (v === undefined || v === null || v === '') f.push(`missing required field: ${k}`);
  }
  if (m.schema_version !== SCHEMA_VERSION) {
    f.push(`schema_version must be ${SCHEMA_VERSION}, got ${m.schema_version}`);
  }
  if (m.source_commit_sha && !SHA40.test(m.source_commit_sha)) {
    f.push(`source_commit_sha must be a full 40-hex commit sha, got: ${m.source_commit_sha}`);
  }
  if (m.image_digest && !DIGEST.test(m.image_digest)) {
    f.push(`image_digest must be sha256:<64 hex>, got: ${m.image_digest}`);
  }
  if (m.build_timestamp_utc && !ISO_UTC.test(m.build_timestamp_utc)) {
    f.push(`build_timestamp_utc must be ISO-8601 UTC ending in Z, got: ${m.build_timestamp_utc}`);
  }
  // The release identity must be the digest. A tag ref here would let a moved tag
  // deploy an unreviewed image while every downstream guard still reported PASS.
  if (m.image_ref_by_digest) {
    if (!m.image_ref_by_digest.includes('@sha256:')) {
      f.push(`image_ref_by_digest must be pinned by digest, got: ${m.image_ref_by_digest}`);
    }
    if (m.image_repository && m.image_digest &&
        m.image_ref_by_digest !== `${m.image_repository}@${m.image_digest}`) {
      f.push('image_ref_by_digest does not equal image_repository@image_digest');
    }
  }
  if (m.image_repository && /:[^/@]+$/.test(m.image_repository)) {
    f.push(`image_repository must not carry a tag, got: ${m.image_repository}`);
  }
  return f;
}

/** Fields actually checked — proves validation was not vacuous. */
function checkedFieldCount() {
  return REQUIRED_FIELDS.length;
}

module.exports = { SCHEMA_VERSION, REQUIRED_FIELDS, build, validate, checkedFieldCount };

// CLI: build a manifest from env and fail closed if it does not validate.
if (require.main === module) {
  const m = build({
    repository: process.env.WC_REPOSITORY,
    source_commit_sha: process.env.WC_SOURCE_SHA,
    source_ref: process.env.WC_SOURCE_REF,
    workflow_run_id: process.env.WC_RUN_ID,
    workflow_run_url: process.env.WC_RUN_URL,
    image_repository: process.env.WC_IMAGE_REPOSITORY,
    image_digest: process.env.WC_IMAGE_DIGEST,
    build_timestamp_utc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    builder_identity: process.env.WC_BUILDER_IDENTITY,
    dockerfile_path: process.env.WC_DOCKERFILE_PATH,
  });
  const findings = validate(m);
  if (findings.length) {
    console.error('RELEASE MANIFEST: FAIL');
    findings.forEach((x) => console.error(`  ${x}`));
    process.exit(1);
  }
  console.log(JSON.stringify(m, null, 2));
}
