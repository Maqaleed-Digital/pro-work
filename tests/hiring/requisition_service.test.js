'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const { createRequisitionService } = require('../../app/modules/hiring/requisition_service')
const { createRequisitionRouter }  = require('../../app/api/requisition_router')
const validationConfig = require('../../app/config/hiring/requisition_validation.json')

// ── Mock pg pool ────────────────────────────────────────────────────────────
function createMockPool() {
  const rows = new Map()
  let lastId = null

  const mockClient = {
    query(sql, params) {
      if (/set_config/i.test(sql)) return { rows: [{}] }

      // INSERT INTO requisitions
      if (/INSERT INTO requisitions/i.test(sql)) {
        const r = {
          id: params[0], tenant_id: params[1], created_by: params[2],
          title: params[3], department: params[4], contract_type: params[5],
          occupation_code: params[6], target_nationality: params[7],
          salary_min: params[8], salary_max: params[9],
          description: params[10], requirements: params[11],
          status: 'DRAFT', nitaqat_preview_run_at: null,
          nitaqat_preview_result: null, published_at: null, filled_at: null,
          closed_reason: null, created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        rows.set(r.id, r)
        lastId = r.id
        return { rows: [r], rowCount: 1 }
      }

      // SELECT * FROM requisitions WHERE id
      if (/SELECT \* FROM requisitions WHERE id/i.test(sql)) {
        const r = rows.get(params[0])
        return { rows: r ? [r] : [], rowCount: r ? 1 : 0 }
      }

      // SELECT * FROM requisitions (list)
      if (/SELECT \* FROM requisitions/i.test(sql)) {
        let all = Array.from(rows.values())
        // Simple status filter if present
        if (params.length > 0 && typeof params[0] === 'string' && validationConfig.validStatuses.includes(params[0])) {
          all = all.filter(r => r.status === params[0])
        }
        return { rows: all, rowCount: all.length }
      }

      // UPDATE requisitions SET status = 'NITAQAT_PREVIEWED'
      if (/status = 'NITAQAT_PREVIEWED'/i.test(sql)) {
        const id = params[1]
        const r = rows.get(id)
        if (r) {
          r.status = 'NITAQAT_PREVIEWED'
          r.nitaqat_preview_run_at = new Date().toISOString()
          r.nitaqat_preview_result = JSON.parse(params[0])
          r.updated_at = new Date().toISOString()
        }
        return { rows: [], rowCount: r ? 1 : 0 }
      }

      // UPDATE requisitions SET status = 'PUBLISHED'
      if (/status = 'PUBLISHED'/i.test(sql)) {
        const r = rows.get(params[0])
        if (r) {
          r.status = 'PUBLISHED'
          r.published_at = new Date().toISOString()
          r.updated_at = new Date().toISOString()
        }
        return { rows: [], rowCount: r ? 1 : 0 }
      }

      // UPDATE requisitions SET status = 'CLOSED'
      if (/status = 'CLOSED'/i.test(sql)) {
        const id = params[1]
        const r = rows.get(id)
        if (r) {
          r.status = 'CLOSED'
          r.closed_reason = params[0]
          r.updated_at = new Date().toISOString()
        }
        return { rows: [], rowCount: r ? 1 : 0 }
      }

      // UPDATE requisitions SET (generic — for updateRequisition)
      if (/UPDATE requisitions SET/i.test(sql)) {
        const id = params[params.length - 1]
        const r = rows.get(id)
        if (r) {
          r.status = 'DRAFT'
          r.nitaqat_preview_run_at = null
          r.nitaqat_preview_result = null
          r.updated_at = new Date().toISOString()
        }
        return { rows: r ? [r] : [], rowCount: r ? 1 : 0 }
      }

      return { rows: [], rowCount: 0 }
    },
    release() {},
  }

  return {
    connect() { return Promise.resolve(mockClient) },
    _rows: rows,
    _getLastId: () => lastId,
  }
}

// Mock Nitaqat engine
const mockNitaqatEngine = {
  calculateImpact(params) {
    const pct = params.establishmentProfile.totalCount > 0
      ? (params.establishmentProfile.saudiCount / params.establishmentProfile.totalCount) * 100 : 0
    return {
      currentZone: pct >= 35 ? 'HIGH_GREEN' : 'YELLOW',
      projectedZone: pct >= 35 ? 'HIGH_GREEN' : 'YELLOW',
      saudiPercentageBefore: pct,
      saudiPercentageAfter: pct,
    }
  }
}

function createMockRes() {
  let _status = 200, _body = ''
  return {
    writeHead(s) { _status = s },
    end(b) { _body = b || '' },
    get status() { return _status },
    get body() { return _body ? JSON.parse(_body) : null },
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

test('createRequisition: happy path FTE', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool, nitaqatEngine: mockNitaqatEngine })
  const r = await svc.createRequisition('T1', 'U1', {
    title: 'Software Engineer', contract_type: 'FTE',
    salary_min: 15000, salary_max: 25000,
  })
  assert.ok(r.id)
  assert.strictEqual(r.status, 'DRAFT')
  assert.strictEqual(r.contract_type, 'FTE')
})

test('createRequisition: happy path FREELANCER', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool })
  const r = await svc.createRequisition('T1', 'U1', {
    title: 'UI Designer', contract_type: 'FREELANCER', salary_min: 5000,
  })
  assert.strictEqual(r.contract_type, 'FREELANCER')
})

test('createRequisition: happy path AI_EXECUTABLE', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool })
  const r = await svc.createRequisition('T1', 'U1', {
    title: 'Data Pipeline', contract_type: 'AI_EXECUTABLE',
  })
  assert.strictEqual(r.contract_type, 'AI_EXECUTABLE')
})

test('createRequisition: rejects invalid contract_type', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool })
  await assert.rejects(
    () => svc.createRequisition('T1', 'U1', { title: 'X', contract_type: 'INTERN' }),
    /invalid contract_type/
  )
})

test('createRequisition: rejects prohibited occupation code', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool })
  await assert.rejects(
    () => svc.createRequisition('T1', 'U1', { title: 'X', contract_type: 'FTE', occupation_code: 'ISCO-0110' }),
    /prohibited/
  )
})

test('createRequisition: rejects salary below min', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool })
  await assert.rejects(
    () => svc.createRequisition('T1', 'U1', { title: 'X', contract_type: 'FTE', salary_min: 100 }),
    /salary_min must be between/
  )
})

test('createRequisition: rejects salary above max', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool })
  await assert.rejects(
    () => svc.createRequisition('T1', 'U1', { title: 'X', contract_type: 'FTE', salary_min: 999999 }),
    /salary_min must be between/
  )
})

test('createRequisition: rejects salary_min > salary_max', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool })
  await assert.rejects(
    () => svc.createRequisition('T1', 'U1', { title: 'X', contract_type: 'FTE', salary_min: 20000, salary_max: 10000 }),
    /salary_min cannot exceed salary_max/
  )
})

test('createRequisition: rejects missing title', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool })
  await assert.rejects(
    () => svc.createRequisition('T1', 'U1', { contract_type: 'FTE' }),
    /title is required/
  )
})

test('createRequisition: rejects missing tenantId', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool })
  await assert.rejects(
    () => svc.createRequisition(null, 'U1', { title: 'X' }),
    /tenantId is required/
  )
})

test('runNitaqatPreview: calls engine, stores result', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool, nitaqatEngine: mockNitaqatEngine })
  await svc.createRequisition('T1', 'U1', { title: 'Eng', contract_type: 'FTE', target_nationality: 'SA' })
  const id = pool._getLastId()
  const preview = await svc.runNitaqatPreview('T1', id, { saudiCount: 10, totalCount: 20 })
  assert.ok(preview.previewResult)
  assert.ok(preview.previewedAt)
  assert.strictEqual(pool._rows.get(id).status, 'NITAQAT_PREVIEWED')
})

test('runNitaqatPreview: rejects for non-DRAFT requisition', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool, nitaqatEngine: mockNitaqatEngine })
  await svc.createRequisition('T1', 'U1', { title: 'Eng', contract_type: 'FTE' })
  const id = pool._getLastId()
  await svc.runNitaqatPreview('T1', id, { saudiCount: 10, totalCount: 20 })
  await svc.publishRequisition('T1', id)
  await assert.rejects(
    () => svc.runNitaqatPreview('T1', id, { saudiCount: 10, totalCount: 20 }),
    /only available for DRAFT/
  )
})

test('publishRequisition: rejects if no preview run', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool })
  await svc.createRequisition('T1', 'U1', { title: 'Eng', contract_type: 'FTE' })
  const id = pool._getLastId()
  await assert.rejects(
    () => svc.publishRequisition('T1', id),
    /must have Nitaqat preview/
  )
})

test('publishRequisition: rejects if preview is stale (>24h)', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool, nitaqatEngine: mockNitaqatEngine })
  await svc.createRequisition('T1', 'U1', { title: 'Eng', contract_type: 'FTE' })
  const id = pool._getLastId()
  await svc.runNitaqatPreview('T1', id, { saudiCount: 10, totalCount: 20 })
  // Manually set preview timestamp to 25 hours ago
  pool._rows.get(id).nitaqat_preview_run_at = new Date(Date.now() - 25 * 3600 * 1000).toISOString()
  await assert.rejects(
    () => svc.publishRequisition('T1', id),
    /stale/
  )
})

test('publishRequisition: succeeds with fresh preview', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool, nitaqatEngine: mockNitaqatEngine })
  await svc.createRequisition('T1', 'U1', { title: 'Eng', contract_type: 'FTE' })
  const id = pool._getLastId()
  await svc.runNitaqatPreview('T1', id, { saudiCount: 10, totalCount: 20 })
  const result = await svc.publishRequisition('T1', id)
  assert.strictEqual(result.status, 'PUBLISHED')
})

test('closeRequisition: happy path', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool, nitaqatEngine: mockNitaqatEngine })
  await svc.createRequisition('T1', 'U1', { title: 'Eng', contract_type: 'FTE' })
  const id = pool._getLastId()
  await svc.runNitaqatPreview('T1', id, { saudiCount: 10, totalCount: 20 })
  await svc.publishRequisition('T1', id)
  const result = await svc.closeRequisition('T1', id, 'Position no longer needed')
  assert.strictEqual(result.status, 'CLOSED')
  assert.strictEqual(result.reason, 'Position no longer needed')
})

test('closeRequisition: rejects already closed', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool, nitaqatEngine: mockNitaqatEngine })
  await svc.createRequisition('T1', 'U1', { title: 'Eng', contract_type: 'FTE' })
  const id = pool._getLastId()
  await svc.runNitaqatPreview('T1', id, { saudiCount: 10, totalCount: 20 })
  await svc.publishRequisition('T1', id)
  await svc.closeRequisition('T1', id, 'Done')
  await assert.rejects(
    () => svc.closeRequisition('T1', id, 'Again'),
    /already CLOSED/
  )
})

test('listRequisitions: returns all for tenant', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool })
  await svc.createRequisition('T1', 'U1', { title: 'A', contract_type: 'FTE' })
  await svc.createRequisition('T1', 'U1', { title: 'B', contract_type: 'FREELANCER' })
  const list = await svc.listRequisitions('T1', {})
  assert.ok(list.length >= 2)
})

test('getRequisition: returns null for non-existent', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool })
  const r = await svc.getRequisition('T1', 'nonexistent-id')
  assert.strictEqual(r, null)
})

test('updateRequisition: resets status to DRAFT after edit', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool, nitaqatEngine: mockNitaqatEngine })
  await svc.createRequisition('T1', 'U1', { title: 'Eng', contract_type: 'FTE' })
  const id = pool._getLastId()
  await svc.runNitaqatPreview('T1', id, { saudiCount: 10, totalCount: 20 })
  assert.strictEqual(pool._rows.get(id).status, 'NITAQAT_PREVIEWED')
  await svc.updateRequisition('T1', id, { title: 'Senior Eng' })
  assert.strictEqual(pool._rows.get(id).status, 'DRAFT')
  assert.strictEqual(pool._rows.get(id).nitaqat_preview_run_at, null)
})

test('constructor: rejects missing pool', () => {
  assert.throws(
    () => createRequisitionService({}),
    /pool is required/
  )
})

// ── Router tests ────────────────────────────────────────────────────────────

test('router: VIEWER cannot create requisition (RBAC)', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool })
  const router = createRequisitionRouter({ requisitionService: svc })
  const res = createMockRes()
  await router.handle({url:'/api/hiring/requisitions'}, res, '/api/hiring/requisitions', 'POST',
    { title: 'X', contract_type: 'FTE' },
    { id: 'U1', tenant_id: 'T1', role: 'VIEWER' })
  assert.strictEqual(res.status, 403)
})

test('router: HIRING_MANAGER can create requisition', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool })
  const router = createRequisitionRouter({ requisitionService: svc })
  const res = createMockRes()
  await router.handle({url:'/api/hiring/requisitions'}, res, '/api/hiring/requisitions', 'POST',
    { title: 'Engineer', contract_type: 'FTE', salary_min: 15000, salary_max: 25000 },
    { id: 'U1', tenant_id: 'T1', role: 'HIRING_MANAGER' })
  assert.strictEqual(res.status, 201)
})

test('router: unauthenticated request rejected', async () => {
  const pool = createMockPool()
  const svc = createRequisitionService({ pool })
  const router = createRequisitionRouter({ requisitionService: svc })
  const res = createMockRes()
  await router.handle({url:'/api/hiring/requisitions'}, res, '/api/hiring/requisitions', 'GET', null, null)
  assert.strictEqual(res.status, 401)
})

test('validation config: version is v1', () => {
  assert.strictEqual(validationConfig.version, 'v1')
})

test('validation config: prohibited codes loaded from JSON', () => {
  assert.ok(validationConfig.prohibitedOccupationCodes.length >= 3)
  assert.ok(validationConfig.prohibitedOccupationCodes.includes('ISCO-0110'))
})

test('validation config: status transitions defined for all statuses', () => {
  for (const s of validationConfig.validStatuses) {
    assert.ok(Array.isArray(validationConfig.statusTransitions[s]),
      `missing transition for status: ${s}`)
  }
})
