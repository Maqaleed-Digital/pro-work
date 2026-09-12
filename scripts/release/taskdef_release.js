'use strict';

/**
 * WC-007 Stage B — live-clone task-definition release tooling.
 *
 * WHY THIS EXISTS
 * ---------------
 * `.github/workflows/production.yml` cannot deploy WorkCaptain. Measured 2026-09-12:
 * its deploy jobs name cluster `prowork-production` / service `prowork-api` in
 * `us-east-1`; `us-east-1` holds zero ECS clusters and no `prowork-*` cluster exists
 * in any region. Live WorkCaptain is `workcaptain-production` / `workcaptain` in
 * `eu-central-1`. Both jobs are tag-gated and have therefore always been SKIPPED,
 * which is what hid the broken names behind a green run.
 *
 * Renaming those three strings would NOT fix it. `update-service --force-new-deployment`
 * redeploys whatever task definition the service already references — it never registers
 * a revision carrying a newly built image. A rename would produce a second confident-green
 * mechanism that still did not deploy the new code.
 *
 * So the release path is: clone the LIVE task definition, patch ONLY the image digest,
 * and prove — structurally — that nothing else moved.
 *
 * RUNTIME AUTHORITY
 * -----------------
 * The live ECS task definition is authoritative for production runtime shape.
 * Terraform state is stale (believes `workcaptain:2`; live is `:17`) and would register
 * a container carrying only two secrets, stripping JWT_SECRET. Terraform is excluded
 * from this path entirely. Nothing here reads, writes or plans Terraform state.
 *
 * This module performs NO AWS mutation. It transforms JSON and returns verdicts.
 */

/**
 * Fields AWS returns on DescribeTaskDefinition that RegisterTaskDefinition rejects.
 *
 * Stripped BY EXPLICIT NAME, never heuristically: a heuristic ("drop anything that
 * looks like metadata") would silently drop a future semantic field and the diff guard
 * would never see it go. Verified against the live `workcaptain:17` payload — all seven
 * are present there and nothing outside this list is response-only.
 */
const RESPONSE_ONLY_FIELDS = Object.freeze([
  'taskDefinitionArn',
  'revision',
  'status',
  'requiresAttributes',
  'compatibilities',
  'registeredAt',
  'registeredBy',
  'deregisteredAt',
]);

/**
 * Arrays whose ORDER carries no meaning, keyed by the field that identifies an element.
 * Canonicalising these prevents a pure reordering from reading as a semantic change.
 * Anything NOT listed here keeps its order, because order may be meaningful
 * (e.g. `command`, `entryPoint`, `placementConstraints`).
 */
const ORDER_INSENSITIVE_ARRAYS = Object.freeze({
  secrets: 'name',
  environment: 'name',
  portMappings: 'containerPort',
  mountPoints: 'containerPath',
  volumesFrom: 'sourceContainer',
  ulimits: 'name',
  systemControls: 'namespace',
  resourceRequirements: 'type',
  dockerLabels: null, // plain object, handled by key sorting
});

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Deterministic ordering so two semantically identical documents compare equal.
 * Sorts object keys, and sorts only the arrays declared order-insensitive above.
 */
function canonicalize(value, keyName) {
  if (Array.isArray(value)) {
    const sortKey = keyName && Object.prototype.hasOwnProperty.call(ORDER_INSENSITIVE_ARRAYS, keyName)
      ? ORDER_INSENSITIVE_ARRAYS[keyName]
      : undefined;
    const items = value.map((v) => canonicalize(v));
    if (sortKey) {
      items.sort((a, b) => {
        const av = isPlainObject(a) ? a[sortKey] : a;
        const bv = isPlainObject(b) ? b[sortKey] : b;
        return String(av).localeCompare(String(bv));
      });
    }
    return items;
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonicalize(value[k], k);
    return out;
  }
  return value;
}

/**
 * Every leaf path where two documents differ, as `a.b[0].c` strings.
 * Reports ABSENCE as a difference too — a dropped secret must surface, and a guard
 * that only compared shared keys would call a deletion "no change".
 */
function diffPaths(a, b, path = '', acc = []) {
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) diffPaths(a[i], b[i], `${path}[${i}]`, acc);
    return acc;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      diffPaths(a[k], b[k], path ? `${path}.${k}` : k, acc);
    }
    return acc;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    acc.push({ path, from: a, to: b });
  }
  return acc;
}

/**
 * Clone a live task definition into a RegisterTaskDefinition-shaped input.
 * Copies by omission — every field not explicitly response-only survives, so a field
 * AWS adds in future is carried forward rather than silently dropped.
 */
function cloneForRegistration(liveTaskDefinition) {
  if (!isPlainObject(liveTaskDefinition)) {
    throw new TypeError('cloneForRegistration: expected the taskDefinition object');
  }
  const out = {};
  for (const [k, v] of Object.entries(liveTaskDefinition)) {
    if (!RESPONSE_ONLY_FIELDS.includes(k)) out[k] = JSON.parse(JSON.stringify(v));
  }
  return out;
}

/** Patch exactly one container's image. Never touches any other field. */
function patchImage(candidate, containerName, newImageRef) {
  if (!newImageRef || !/^[^\s]+@sha256:[0-9a-f]{64}$/.test(newImageRef)) {
    throw new Error(
      `patchImage: image must be pinned by immutable digest (repo@sha256:<64 hex>), got: ${newImageRef}`
    );
  }
  const next = JSON.parse(JSON.stringify(candidate));
  const containers = next.containerDefinitions || [];
  const target = containers.find((c) => c.name === containerName);
  if (!target) {
    throw new Error(`patchImage: no container named "${containerName}" in the candidate`);
  }
  target.image = newImageRef;
  return next;
}

/**
 * Named invariants, asserted in addition to the structural diff.
 *
 * The diff alone is already strict. These exist because a named check reports
 * "JWT_SECRET was dropped" instead of "containerDefinitions[0].secrets[2] differs",
 * and because they fail loudly if a future refactor ever weakens the diff.
 */
function checkInvariants(liveStripped, candidate, containerName, opts = {}) {
  const findings = [];
  const L = (liveStripped.containerDefinitions || []).find((c) => c.name === containerName);
  const C = (candidate.containerDefinitions || []).find((c) => c.name === containerName);
  if (!L || !C) {
    findings.push(`container "${containerName}" missing from ${!L ? 'live' : 'candidate'}`);
    return findings;
  }

  const eq = (label, a, b) => {
    // The field name MUST be forwarded: canonicalize() only sorts an order-insensitive
    // array when it knows which field it is. Omitting it made a pure reorder read as a
    // semantic change — caught by the reordering negative control, not by inspection.
    if (JSON.stringify(canonicalize(a, label)) !== JSON.stringify(canonicalize(b, label))) {
      findings.push(`${label} changed`);
    }
  };

  eq('taskRoleArn', liveStripped.taskRoleArn, candidate.taskRoleArn);
  eq('executionRoleArn', liveStripped.executionRoleArn, candidate.executionRoleArn);
  eq('networkMode', liveStripped.networkMode, candidate.networkMode);
  eq('cpu', liveStripped.cpu, candidate.cpu);
  eq('memory', liveStripped.memory, candidate.memory);
  eq('family', liveStripped.family, candidate.family);
  eq('volumes', liveStripped.volumes, candidate.volumes);
  eq('requiresCompatibilities', liveStripped.requiresCompatibilities, candidate.requiresCompatibilities);
  eq('runtimePlatform', liveStripped.runtimePlatform, candidate.runtimePlatform);

  eq('repositoryCredentials', L.repositoryCredentials, C.repositoryCredentials);
  eq('portMappings', L.portMappings, C.portMappings);
  eq('healthCheck', L.healthCheck, C.healthCheck);
  eq('logConfiguration', L.logConfiguration, C.logConfiguration);
  // ENV_ADDITION_ONLY guards the environment exhaustively as a name->value map, where an
  // addition is the POINT of the release. Comparing it wholesale here would reject the very
  // delta being reviewed. Every other profile still compares it. Default stays strict.
  if (!opts.skipEnvironment) eq('environment', L.environment, C.environment);

  const lSecrets = L.secrets || [];
  const cSecrets = C.secrets || [];
  if (lSecrets.length !== cSecrets.length) {
    findings.push(`secret COUNT changed: ${lSecrets.length} -> ${cSecrets.length}`);
  }
  const lNames = lSecrets.map((s) => s.name).sort();
  const cNames = cSecrets.map((s) => s.name).sort();
  if (JSON.stringify(lNames) !== JSON.stringify(cNames)) {
    findings.push(`secret NAMES changed: [${lNames}] -> [${cNames}]`);
  }
  for (const name of lNames) {
    const a = lSecrets.find((s) => s.name === name);
    const b = cSecrets.find((s) => s.name === name);
    if (b && a.valueFrom !== b.valueFrom) findings.push(`secret ${name} valueFrom ARN changed`);
  }
  // Named explicitly: these three are the runtime secrets a stale-Terraform apply
  // is known to strip. Their absence must never be reported as a structural nuance.
  for (const required of ['DATABASE_URL', 'ADMIN_API_TOKEN', 'JWT_SECRET']) {
    if (!cNames.includes(required)) findings.push(`REQUIRED secret ${required} is ABSENT from candidate`);
  }
  return findings;
}

/**
 * The release contract: the candidate may differ from the live task definition in
 * EXACTLY ONE semantic place — the target container's `image`, moving to the new
 * Stage-A digest. Anything else is a hard fail. There is no warning mode.
 */
function diffGuard(liveTaskDefinition, candidate, { containerName, expectedNewImage }) {
  const liveStripped = cloneForRegistration(liveTaskDefinition);
  const a = canonicalize(liveStripped);
  const b = canonicalize(candidate);
  const deltas = diffPaths(a, b);

  const imagePathRe = /^containerDefinitions\[\d+\]\.image$/;
  const imageDeltas = deltas.filter((d) => imagePathRe.test(d.path));
  const otherDeltas = deltas.filter((d) => !imagePathRe.test(d.path));

  const findings = [];
  for (const d of otherDeltas) {
    findings.push(`FORBIDDEN delta at ${d.path}: ${JSON.stringify(d.from)} -> ${JSON.stringify(d.to)}`);
  }
  if (imageDeltas.length === 0) {
    findings.push('NO image delta: the release contract requires exactly one image change');
  }
  if (imageDeltas.length > 1) {
    findings.push(`image changed on ${imageDeltas.length} containers; exactly one is allowed`);
  }
  if (imageDeltas.length === 1 && expectedNewImage && imageDeltas[0].to !== expectedNewImage) {
    findings.push(`image delta does not match the Stage-A digest: got ${imageDeltas[0].to}, expected ${expectedNewImage}`);
  }
  findings.push(...checkInvariants(liveStripped, candidate, containerName));

  return {
    pass: findings.length === 0,
    findings,
    imageFrom: imageDeltas.length === 1 ? imageDeltas[0].from : null,
    imageTo: imageDeltas.length === 1 ? imageDeltas[0].to : null,
    // Proves the guard actually compared something. A guard that evaluated zero
    // paths must never be reportable as clean.
    comparedPaths: countLeaves(a),
  };
}

function countLeaves(v) {
  if (Array.isArray(v)) return v.reduce((n, x) => n + countLeaves(x), 0);
  if (isPlainObject(v)) return Object.values(v).reduce((n, x) => n + countLeaves(x), 0);
  return 1;
}

module.exports = {
  RESPONSE_ONLY_FIELDS,
  cloneForRegistration,
  patchImage,
  diffGuard,
  canonicalize,
  diffPaths,
  countLeaves,
};

// ── WC-012: explicit release profiles ────────────────────────────────────────
//
// The default release class permits exactly one semantic delta: the application image
// identity. The HSTS closure needs a DIFFERENT single delta — adding TRUSTED_PROXY="1"
// to the environment, with the image held constant.
//
// That is deliberately NOT expressed by relaxing the guard to "environment changes are
// allowed". A profile enumerates the exact permitted transition, so anything else in the
// environment — a second variable, a changed value, a removal — still fails.
//
// Profiles are additive. Adding one must never widen an existing one.

const RELEASE_PROFILES = Object.freeze({
  IMAGE_ONLY: 'IMAGE_ONLY',
  ENV_ADDITION_ONLY: 'ENV_ADDITION_ONLY',
});

/**
 * Guard for ENV_ADDITION_ONLY.
 *
 * Permits exactly the enumerated environment additions and nothing else. The image must be
 * byte-identical: a release that changes both configuration and code cannot attribute a
 * failure to either.
 *
 * @param permittedAdditions [{name, value}] — exact names AND exact values.
 */
function envAdditionGuard(liveTaskDefinition, candidate, { containerName, permittedAdditions }) {
  const findings = [];
  const liveStripped = cloneForRegistration(liveTaskDefinition);
  const L = (liveStripped.containerDefinitions || []).find((c) => c.name === containerName);
  const C = (candidate.containerDefinitions || []).find((c) => c.name === containerName);
  if (!L || !C) return { pass: false, findings: [`container "${containerName}" missing`], comparedPaths: 0 };

  if (!Array.isArray(permittedAdditions) || permittedAdditions.length === 0) {
    return { pass: false, findings: ['no permitted additions enumerated — refusing an open-ended env change'], comparedPaths: 0 };
  }

  // The image must NOT move under this profile.
  if (L.image !== C.image) {
    findings.push(`image changed under ENV_ADDITION_ONLY: ${L.image} -> ${C.image}`);
  }

  // Compare environment as name->value maps so an insertion does not read as positional churn.
  const toMap = (arr) => new Map((arr || []).map((e) => [e.name, e.value]));
  const lEnv = toMap(L.environment);
  const cEnv = toMap(C.environment);

  const permitted = new Map(permittedAdditions.map((p) => [p.name, p.value]));
  for (const [name, value] of cEnv) {
    if (!lEnv.has(name)) {
      if (!permitted.has(name)) findings.push(`FORBIDDEN environment addition: ${name}`);
      else if (permitted.get(name) !== value) {
        findings.push(`${name} added with value "${value}", permitted value is "${permitted.get(name)}"`);
      }
    } else if (lEnv.get(name) !== value) {
      findings.push(`FORBIDDEN environment change: ${name} "${lEnv.get(name)}" -> "${value}"`);
    }
  }
  for (const name of lEnv.keys()) {
    if (!cEnv.has(name)) findings.push(`FORBIDDEN environment removal: ${name}`);
  }
  for (const [name] of permitted) {
    if (!cEnv.has(name)) findings.push(`permitted addition ${name} is not present in the candidate`);
    if (lEnv.has(name)) findings.push(`${name} already exists live — this is not an addition`);
  }

  // Everything OUTSIDE the environment must be semantically identical. Reuse the existing
  // structural machinery with environment neutralised on both sides, so the same code path
  // that guards an image release also guards this one.
  const stripEnv = (td) => {
    const c = JSON.parse(JSON.stringify(td));
    for (const cd of c.containerDefinitions || []) delete cd.environment;
    return c;
  };
  const a = canonicalize(stripEnv(liveStripped));
  const b = canonicalize(stripEnv(candidate));
  for (const d of diffPaths(a, b)) {
    findings.push(`FORBIDDEN delta at ${d.path}: ${JSON.stringify(d.from)} -> ${JSON.stringify(d.to)}`);
  }

  // Named invariants still apply — secrets, roles, credentials.
  findings.push(...checkInvariants(liveStripped, candidate, containerName, { skipEnvironment: true }));

  return {
    pass: findings.length === 0,
    findings,
    comparedPaths: countLeaves(a) + cEnv.size,
    permittedDeltas: permittedAdditions.map((p) => `environment.${p.name}=${p.value}`),
  };
}

module.exports.RELEASE_PROFILES = RELEASE_PROFILES;
module.exports.envAdditionGuard = envAdditionGuard;

// ── WC-010 / DL-WC-ECR-AUTH-001: REGISTRY_MIGRATION profile ──────────────────
//
// A third release class, added as an explicit enumeration. IMAGE_ONLY and
// ENV_ADDITION_ONLY are untouched and still reject this candidate — profiles narrow the
// permitted delta, they never widen each other.
//
// The GHCR -> ECR migration must move the artifact WITHOUT changing it. DL-WC-ECR-AUTH-001
// makes digest equality a REQUIRED PREDICATE, not an allowed delta:
//
//     SOURCE_GHCR_DIGEST == TARGET_ECR_DIGEST
//
// That is why the migration copies rather than rebuilds. A second independent build from the
// same source SHA is not bit-identical, and would silently create a new artifact provenance
// chain under a decision that authorised moving the existing one.
//
// Proven read-only before this was written: docker.io/library/alpine:3.20 and
// public.ecr.aws/docker/library/alpine:3.20 serve the IDENTICAL digest
// sha256:d9e853e8…b6bc, both as application/vnd.oci.image.index.v1+json with 16 entries
// including the unknown/unknown attestation manifests buildx provenance emits. ECR therefore
// preserves OCI indexes with attestations byte-for-byte.

const IMAGE_REF = /^(.+)@(sha256:[0-9a-f]{64})$/;

function splitImageRef(ref) {
  const m = IMAGE_REF.exec(String(ref || ''));
  return m ? { repository: m[1], digest: m[2] } : null;
}

/**
 * Guard for REGISTRY_MIGRATION.
 *
 * Permits EXACTLY two semantic deltas and nothing else:
 *   A. image repository identity: GHCR -> the approved ECR repository, DIGEST IDENTICAL
 *   B. repositoryCredentials: present -> absent
 *
 * @param approvedTargetRepository the ECR repository this migration is authorised to use.
 *        Passing it explicitly means a candidate cannot drift to some other registry and
 *        still satisfy "it changed registry".
 */
function registryMigrationGuard(liveTaskDefinition, candidate, opts) {
  const { containerName, approvedTargetRepository, approvedDigest } = opts || {};
  const findings = [];
  const liveStripped = cloneForRegistration(liveTaskDefinition);
  const L = (liveStripped.containerDefinitions || []).find((c) => c.name === containerName);
  const C = (candidate.containerDefinitions || []).find((c) => c.name === containerName);
  if (!L || !C) return { pass: false, findings: [`container "${containerName}" missing`], comparedPaths: 0 };

  if (!approvedTargetRepository) {
    return { pass: false, findings: ['no approved target repository enumerated — refusing an open-ended registry change'], comparedPaths: 0 };
  }

  const src = splitImageRef(L.image);
  const tgt = splitImageRef(C.image);

  // Delta A — and the predicate that makes it safe.
  if (!src) findings.push(`live image is not digest-pinned: ${L.image}`);
  if (!tgt) {
    // Covers the tag case explicitly: a tag has no @sha256 and must never become the
    // runtime identity, which is the whole discipline WC-007 established.
    findings.push(`candidate image is not digest-pinned (a tag must never be the runtime identity): ${C.image}`);
  }
  if (src && tgt) {
    if (src.digest !== tgt.digest) {
      findings.push(
        `DIGEST CHANGED: ${src.digest} -> ${tgt.digest}. Digest equality is a REQUIRED PREDICATE ` +
        `under DL-WC-ECR-AUTH-001, not an allowed delta. Do not rebuild — copy.`
      );
    }
    if (approvedDigest && tgt.digest !== approvedDigest) {
      findings.push(`candidate digest ${tgt.digest} is not the approved artifact ${approvedDigest}`);
    }
    if (tgt.repository !== approvedTargetRepository) {
      findings.push(`target repository ${tgt.repository} is not the approved ECR repository ${approvedTargetRepository}`);
    }
    if (src.repository === tgt.repository) {
      findings.push('repository identity did not change — this profile exists to perform a registry migration');
    }
  }

  // Delta B — repositoryCredentials must DISAPPEAR, not change.
  const hadCreds = !!(L.repositoryCredentials && L.repositoryCredentials.credentialsParameter);
  const hasCreds = !!(C.repositoryCredentials && C.repositoryCredentials.credentialsParameter);
  if (!hadCreds) findings.push('live task definition has no repositoryCredentials — nothing to remove');
  if (hasCreds) {
    const same = hadCreds && L.repositoryCredentials.credentialsParameter === C.repositoryCredentials.credentialsParameter;
    findings.push(
      same
        ? 'repositoryCredentials RETAINED — ECR pulls on the execution role and must not carry a registry credential'
        : 'repositoryCredentials CHANGED to another credential — it must be REMOVED, not swapped'
    );
  }

  // Everything else must be semantically identical. Image and repositoryCredentials are
  // neutralised on both sides so the SAME structural machinery that guards an image release
  // also guards this one.
  const neutralise = (td) => {
    const c = JSON.parse(JSON.stringify(td));
    for (const cd of c.containerDefinitions || []) { delete cd.image; delete cd.repositoryCredentials; }
    return c;
  };
  const a = canonicalize(neutralise(liveStripped));
  const b = canonicalize(neutralise(candidate));
  for (const d of diffPaths(a, b)) {
    findings.push(`FORBIDDEN delta at ${d.path}: ${JSON.stringify(d.from)} -> ${JSON.stringify(d.to)}`);
  }

  // Named invariants still apply — secrets, roles, env. repositoryCredentials is expected to
  // change here and is checked above instead.
  for (const f of checkInvariants(liveStripped, candidate, containerName)) {
    if (/repositoryCredentials/.test(f)) continue;
    findings.push(f);
  }

  return {
    pass: findings.length === 0,
    findings,
    comparedPaths: countLeaves(a),
    sourceImage: L.image,
    targetImage: C.image,
    digestPreserved: !!(src && tgt && src.digest === tgt.digest),
    permittedDeltas: ['containerDefinitions[].image (repository only, digest identical)',
                      'containerDefinitions[].repositoryCredentials (present -> absent)'],
  };
}

module.exports.RELEASE_PROFILES = Object.freeze({
  ...RELEASE_PROFILES,
  REGISTRY_MIGRATION: 'REGISTRY_MIGRATION',
});
module.exports.registryMigrationGuard = registryMigrationGuard;
module.exports.splitImageRef = splitImageRef;
