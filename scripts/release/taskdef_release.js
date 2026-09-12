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
function checkInvariants(liveStripped, candidate, containerName) {
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
  eq('environment', L.environment, C.environment);

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
