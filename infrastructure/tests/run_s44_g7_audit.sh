#!/bin/sh
set -e
cd /workspace
export NODE_PATH=/workspace/app/node_modules

echo "=== S44-G7 Evidence Pack Audit ==="
node -e "
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
async function run() {
  const client = await pool.connect()
  try {
    // Pack type summary
    const summary = await client.query(
      \"SELECT pack_type, count(*)::int AS count, min(created_at)::text AS first, max(created_at)::text AS last FROM evidence_packs GROUP BY pack_type ORDER BY pack_type\"
    )
    console.log('Evidence pack audit:')
    summary.rows.forEach(r => {
      console.log('  ' + r.pack_type + ': ' + r.count + ' packs (first=' + r.first.slice(0,19) + ' last=' + r.last.slice(0,19) + ')')
    })
    console.log('  Total: ' + summary.rows.reduce((s, r) => s + r.count, 0))

    // Verify each pack has non-empty data_snapshot
    const empty = await client.query(
      \"SELECT count(*)::int AS cnt FROM evidence_packs WHERE data_snapshot IS NULL OR data_snapshot::text = '{}'\"
    )
    console.log('  Empty snapshots: ' + empty.rows[0].cnt)

    // Verify immutable_hash present on all
    const noHash = await client.query(
      \"SELECT count(*)::int AS cnt FROM evidence_packs WHERE immutable_hash IS NULL OR immutable_hash = ''\"
    )
    console.log('  Missing hashes: ' + noHash.rows[0].cnt)

  } finally { client.release(); await pool.end() }
}
run().catch(e => console.error(e.message))
"

echo "=== S44-G7 Full Regression ==="
node --test tests/contracts/ tests/compliance/ tests/programs/ tests/hiring/ 2>&1 | tail -10

echo "=== S44-G7 Audit Complete ==="
