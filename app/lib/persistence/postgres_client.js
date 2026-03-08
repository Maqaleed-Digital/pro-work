"use strict"

/**
 * PostgreSQL Persistence Layer for ProWork
 * Replaces in-memory Maps with PostgreSQL storage
 */

const { Pool } = require("pg")

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://prowork:prowork@localhost:5432/prowork",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Connection health check
async function healthCheck() {
  try {
    const client = await pool.connect()
    const result = await client.query("SELECT NOW() as time")
    client.release()
    return { ok: true, time: result.rows[0].time }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// Initialize database schema
async function initSchema() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(32) DEFAULT 'active',
        config JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS workers (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) REFERENCES tenants(id),
        type VARCHAR(32) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        skills JSONB DEFAULT '[]',
        availability JSONB DEFAULT '{}',
        status VARCHAR(32) DEFAULT 'active',
        assigned_pod JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pods (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) REFERENCES tenants(id),
        name VARCHAR(255) NOT NULL,
        state VARCHAR(32) DEFAULT 'active',
        capacity JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS assignments (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) REFERENCES tenants(id),
        worker_id VARCHAR(64) REFERENCES workers(id),
        pod_id VARCHAR(64) REFERENCES pods(id),
        role VARCHAR(64) DEFAULT 'member',
        state VARCHAR(32) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS evidence_events (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) REFERENCES tenants(id),
        actor VARCHAR(255),
        action VARCHAR(255) NOT NULL,
        entity_type VARCHAR(255) NOT NULL,
        entity_id VARCHAR(64),
        snapshot JSONB,
        timestamp TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        budget DECIMAL(15,2),
        status VARCHAR(32) DEFAULT 'open',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS proposals (
        id VARCHAR(64) PRIMARY KEY,
        job_id VARCHAR(64) REFERENCES jobs(id),
        freelancer_name VARCHAR(255) NOT NULL,
        price DECIMAL(15,2),
        message TEXT,
        status VARCHAR(32) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS contract_intents (
        id VARCHAR(64) PRIMARY KEY,
        job_id VARCHAR(64) REFERENCES jobs(id),
        proposal_id VARCHAR(64) REFERENCES proposals(id),
        buyer_name VARCHAR(255),
        terms_summary TEXT,
        status VARCHAR(32) DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS admin_principals (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(64) NOT NULL,
        status VARCHAR(32) DEFAULT 'active',
        token_hash VARCHAR(128) NOT NULL UNIQUE,
        tenant_id VARCHAR(64) DEFAULT 'default',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reserve_registry (
        id VARCHAR(64) PRIMARY KEY,
        config JSONB DEFAULT '{}',
        balance DECIMAL(20,8) DEFAULT 0,
        status VARCHAR(32) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_proofs (
        id VARCHAR(64) PRIMARY KEY,
        hash VARCHAR(128) NOT NULL,
        context_keys JSONB,
        context JSONB,
        status VARCHAR(32) DEFAULT 'valid',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_workers_tenant ON workers(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
      CREATE INDEX IF NOT EXISTS idx_pods_tenant ON pods(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_tenant ON assignments(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_tenant ON evidence_events(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_timestamp ON evidence_events(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_proposals_job ON proposals(job_id);

      INSERT INTO tenants (id, name, status)
      VALUES ('default', 'Default Tenant', 'active')
      ON CONFLICT (id) DO NOTHING;
    `)
    return { ok: true, message: "Schema initialized" }
  } catch (err) {
    return { ok: false, error: err.message }
  } finally {
    client.release()
  }
}

async function insert(table, data) {
  const keys = Object.keys(data)
  const values = Object.values(data)
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ")
  const columns = keys.join(", ")
  const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`
  const result = await pool.query(query, values)
  return result.rows[0]
}

async function findById(table, id) {
  const result = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id])
  return result.rows[0] || null
}

async function findAll(table, conditions = {}, options = {}) {
  let query = `SELECT * FROM ${table}`
  const values = []
  const where = []
  
  Object.entries(conditions).forEach(([key, value], i) => {
    where.push(`${key} = $${i + 1}`)
    values.push(value)
  })
  
  if (where.length > 0) query += ` WHERE ${where.join(" AND ")}`
  if (options.orderBy) query += ` ORDER BY ${options.orderBy}`
  if (options.limit) query += ` LIMIT ${parseInt(options.limit)}`
  
  const result = await pool.query(query, values)
  return result.rows
}

async function update(table, id, data) {
  const keys = Object.keys(data)
  const values = Object.values(data)
  const sets = keys.map((key, i) => `${key} = $${i + 1}`).join(", ")
  values.push(id)
  const query = `UPDATE ${table} SET ${sets}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`
  const result = await pool.query(query, values)
  return result.rows[0]
}

async function remove(table, id) {
  const result = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [id])
  return result.rows[0]
}

async function transaction(callback) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await callback(client)
    await client.query("COMMIT")
    return result
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }
}

module.exports = {
  pool,
  healthCheck,
  initSchema,
  insert,
  findById,
  findAll,
  update,
  remove,
  transaction
}
