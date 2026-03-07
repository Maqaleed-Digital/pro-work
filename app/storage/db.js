'use strict';

const { loadRuntimeConfig } = require('../config/runtime_config');

class DB {
  constructor() {
    this.connected = false;
    this.connection_info = null;
  }

  connect() {
    const config = loadRuntimeConfig();

    if (!config.database_url) {
      return { connected: false, reason: 'database url not configured' };
    }

    this.connected = true;
    this.connection_info = { database_url: config.database_url };
    return { connected: true };
  }

  status() {
    return { connected: this.connected };
  }
}

module.exports = new DB();
