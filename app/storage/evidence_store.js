'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadRuntimeConfig } = require('../config/runtime_config');

class EvidenceStore {
  writePack(packId, payload) {
    const config = loadRuntimeConfig();
    const dir = path.join(config.evidence_root, packId);

    fs.mkdirSync(dir, { recursive: true });

    const file = path.join(dir, 'pack.json');
    fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');

    return { ok: true, path: file };
  }
}

module.exports = new EvidenceStore();
