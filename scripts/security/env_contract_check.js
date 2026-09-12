#!/usr/bin/env node
'use strict';

/**
 * WC-012 — code <-> runtime environment contract checker.
 *
 * THE DEFECT CLASS THIS CLOSES
 * ----------------------------
 * WC-007's structural guard proves a candidate task definition preserves the live one
 * except for a permitted delta. WC-012's amendment to DL-WC-RELEASE-MECH-001 proves the
 * released ARTIFACT is the intended one. Neither asks the remaining question:
 *
 *   does the runtime environment satisfy what the shipped CODE actually requires?
 *
 * workcaptain:18 shipped correct HSTS code and emitted no HSTS header, because
 * app/server.js gates it on TRUSTED_PROXY, which production never supplied. Both the
 * structural guard and the identity controls were correct and silent — the candidate
 * preserved everything, and the artifact was the intended one. Nothing lied. The question
 * simply was not asked.
 *
 * CI could not have caught it either: tests/security/security_headers.test.js injects
 * TRUSTED_PROXY: '1' when it spawns the server, so it proves the behaviour WHEN set.
 * A green suite and a header-less production surface were both true, about different
 * environments.
 *
 * This checker compares config/runtime-env-contract.json against a task-definition
 * document. It needs no AWS access: it reads a JSON file, so CI runs it against the
 * governed fixture and a release runs it against the live baseline.
 *
 * Fail-closed. Every finding is reported, not just the first.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_CONTRACT = path.join(ROOT, 'config', 'runtime-env-contract.json');

const ENV_CLASSES    = ['REQUIRED_RUNTIME', 'BEHAVIOUR_GATING', 'OPTIONAL_RUNTIME'];
const SECRET_CLASSES = ['SECRET_RUNTIME'];
const NON_RUNTIME    = ['BUILD_ONLY', 'TEST_ONLY'];

function loadContract(p) {
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(c.variables)) throw new Error('contract has no variables[]');
  return c;
}

/** Accepts either a DescribeTaskDefinition response or a bare task definition. */
function normaliseTaskDef(doc) {
  const td = doc && doc.taskDefinition ? doc.taskDefinition : doc;
  if (!td || typeof td !== 'object') throw new Error('task definition document is not an object');
  if (!Array.isArray(td.containerDefinitions) || td.containerDefinitions.length === 0) {
    throw new Error('task definition has no containerDefinitions');
  }
  return td;
}

function check(contract, taskDefDoc, containerName) {
  const findings = [];
  let checked = 0;

  let td;
  try {
    td = normaliseTaskDef(taskDefDoc);
  } catch (e) {
    // Case 8: malformed fixture is a FAILURE, never a pass with nothing checked.
    return { pass: false, findings: [`MALFORMED task definition: ${e.message}`], checked: 0 };
  }

  const container = td.containerDefinitions.find((c) => c.name === containerName);
  if (!container) {
    return {
      pass: false,
      findings: [`container "${containerName}" not present in task definition`],
      checked: 0,
    };
  }

  const envList    = Array.isArray(container.environment) ? container.environment : [];
  const secretList = Array.isArray(container.secrets) ? container.secrets : [];
  const envMap     = new Map();
  const secretSet  = new Set(secretList.map((s) => s.name));

  // Case 7: duplication in the task definition itself. A duplicated key is ambiguous —
  // which value wins is an implementation detail nobody should be relying on.
  for (const e of envList) {
    if (envMap.has(e.name)) findings.push(`DUPLICATE environment entry in task definition: ${e.name}`);
    envMap.set(e.name, e.value);
  }
  const secretCounts = new Map();
  for (const s of secretList) secretCounts.set(s.name, (secretCounts.get(s.name) || 0) + 1);
  for (const [n, c] of secretCounts) if (c > 1) findings.push(`DUPLICATE secret entry in task definition: ${n}`);

  // Case 7 (contract side): the same variable declared twice is an authoring error.
  const seen = new Set();
  for (const v of contract.variables) {
    if (seen.has(v.name)) findings.push(`DUPLICATE contract declaration: ${v.name}`);
    seen.add(v.name);
  }

  for (const v of contract.variables) {
    if (NON_RUNTIME.includes(v.class)) continue;
    checked++;

    if (SECRET_CLASSES.includes(v.class)) {
      // Case 5: a required secret must be present as a secret.
      if (v.production_required && !secretSet.has(v.name)) {
        findings.push(`REQUIRED secret ${v.name} is ABSENT from container secrets`);
      }
      // Case 6: a secret must never appear as plaintext environment.
      if (envMap.has(v.name)) {
        findings.push(
          `SECRET ${v.name} appears as PLAINTEXT environment — secret-backed variables must never be moved to environment`
        );
      }
      continue;
    }

    if (!ENV_CLASSES.includes(v.class)) {
      findings.push(`UNKNOWN class "${v.class}" for ${v.name}`);
      continue;
    }

    const present = envMap.has(v.name);

    // Cases 1 and 2: required runtime / behaviour-gating variable missing.
    if (v.production_required && !present) {
      findings.push(
        `${v.class} variable ${v.name} is MISSING from the runtime environment — ${v.reason || 'no reason recorded'}`
      );
      continue;
    }
    if (!present) continue; // optional and absent: allowed by contract

    // Case 4: present but carrying a value the contract does not accept.
    if (Array.isArray(v.accepted_values) && v.accepted_values.length > 0) {
      const actual = envMap.get(v.name);
      if (!v.accepted_values.includes(actual)) {
        findings.push(
          `${v.name} has value "${actual}" which is not in accepted_values [${v.accepted_values.join(', ')}]`
        );
      }
    }
    // A behaviour-gating variable present but empty is the same defect as absent.
    if (v.class === 'BEHAVIOUR_GATING' && v.production_required && String(envMap.get(v.name) ?? '') === '') {
      findings.push(`BEHAVIOUR_GATING variable ${v.name} is present but EMPTY`);
    }
  }

  // Case 3 support: a required variable supplied under the wrong name shows up as
  // (missing required) + (unexpected orphan). Orphans are reported so the pair is visible.
  const declared = new Set(contract.variables.map((v) => v.name));
  const orphans = [...envMap.keys()].filter((n) => !declared.has(n));
  for (const o of orphans) {
    findings.push(
      `UNDECLARED environment variable in runtime: ${o} — not in the contract. Either the code reads it (add it) or nothing does (it is decorative and misleading).`
    );
  }

  // Non-vacuity: a checker that evaluated nothing must never report clean.
  if (checked === 0) findings.push('checked ZERO variables — the contract is empty or entirely non-runtime');

  return { pass: findings.length === 0, findings, checked, orphans };
}

module.exports = { loadContract, normaliseTaskDef, check, DEFAULT_CONTRACT };

if (require.main === module) {
  const tdPath = process.argv[2];
  const container = process.argv[3] || 'workcaptain';
  if (!tdPath) {
    console.error('usage: env_contract_check.js <task-definition.json> [containerName]');
    process.exit(2);
  }
  const contract = loadContract(process.env.WC_ENV_CONTRACT || DEFAULT_CONTRACT);
  const doc = JSON.parse(fs.readFileSync(tdPath, 'utf8'));
  const r = check(contract, doc, container);
  console.log('┌─ WC-012 runtime environment contract ─────────────────────────');
  console.log(`│  contract   : ${contract.product} schema v${contract.schema_version}`);
  console.log(`│  container  : ${container}`);
  console.log(`│  evaluated  : ${r.checked} runtime variables`);
  console.log('└──────────────────────────────────────────────────────────────\n');
  if (r.findings.length) {
    for (const f of r.findings) console.error(`  ✗ ${f}`);
    console.error('\nENV CONTRACT: FAIL');
    process.exit(1);
  }
  console.log('ENV CONTRACT: PASS — every declared runtime variable is satisfied.');
}
