'use strict';

function required(name, value) {
  if (!value) {
    throw new Error('missing required env: ' + name);
  }
  return value;
}

function loadRuntimeConfig(env = process.env) {
  return {
    node_env: env.NODE_ENV || 'development',
    port: Number(env.PORT || 3000),
    log_level: env.LOG_LEVEL || 'info',
    database_url: env.DATABASE_URL || '',
    evidence_root: env.EVIDENCE_ROOT || '/var/lib/prowork/evidence',
    service_name: env.SERVICE_NAME || 'prowork',
    require_database: env.REQUIRE_DATABASE === 'true'
  };
}

function validateRuntimeConfig(config) {
  if (config.require_database) {
    required('DATABASE_URL', config.database_url);
  }

  if (!config.evidence_root) {
    throw new Error('missing evidence_root');
  }

  return true;
}

module.exports = {
  loadRuntimeConfig,
  validateRuntimeConfig
};
