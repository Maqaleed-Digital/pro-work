'use strict';

/**
 * WOS Core API Router — Sprint A
 *
 * Pure route-dispatch module. No HTTP server dependency.
 * Returns { status, body } for each matched route, or null for no match.
 *
 * Integration pattern (Node http.IncomingMessage):
 *
 *   const router = createWosRouter({ wos, dashboard });
 *   const result = await router.dispatch(method, pathname, tenantId, body, actor);
 *   if (result) {
 *     res.writeHead(result.status, { 'Content-Type': 'application/json' });
 *     res.end(JSON.stringify(result.body));
 *   }
 *
 * Routes:
 *
 *   Projects
 *     POST   /api/wos/projects                     → create project
 *     GET    /api/wos/projects                     → list projects
 *     GET    /api/wos/projects/:project_id         → get project
 *     POST   /api/wos/projects/:project_id/status  → set status
 *
 *   Workstreams
 *     POST   /api/wos/workstreams                  → create workstream
 *     GET    /api/wos/workstreams                  → list (tenant + optional ?project_id)
 *     GET    /api/wos/workstreams/:id              → get workstream
 *
 *   Milestones
 *     POST   /api/wos/milestones                   → create milestone
 *     GET    /api/wos/milestones                   → list (tenant + optional ?workstream_id)
 *     GET    /api/wos/milestones/:id               → get milestone
 *     POST   /api/wos/milestones/:id/complete      → complete milestone (trust-sensitive)
 *
 *   Workers
 *     POST   /api/wos/workers                      → create worker
 *     GET    /api/wos/workers                      → list workers
 *     GET    /api/wos/workers/:id                  → get worker
 *     PATCH  /api/wos/workers/:id                  → patch worker
 *     POST   /api/wos/workers/:id/status           → set status
 *
 *   Pods
 *     POST   /api/wos/pods                         → create pod
 *     GET    /api/wos/pods                         → list pods
 *     GET    /api/wos/pods/:id                     → get pod
 *
 *   Assignments
 *     POST   /api/wos/assignments                  → create assignment
 *     GET    /api/wos/assignments                  → list assignments
 *     POST   /api/wos/assignments/:id/deactivate   → deactivate assignment
 *
 *   Execution Jobs
 *     POST   /api/wos/execution-jobs               → create execution job
 *     GET    /api/wos/execution-jobs               → list
 *     POST   /api/wos/execution-jobs/:id/complete  → complete job
 *
 *   Dashboard Projection
 *     GET    /api/wos/dashboard                    → get tenant dashboard state
 */

function ok(body, status = 200) { return { status, body }; }
function created(body)          { return { status: 201, body }; }

function notFound(entity, id) {
  return { status: 404, body: { error: { code: 'NOT_FOUND', message: `${entity} not found: ${id}` } } };
}

function badRequest(message, code = 'VALIDATION_ERROR') {
  return { status: 400, body: { error: { code, message } } };
}

function handleDomainErr(err) {
  const codeMap = {
    NOT_FOUND:           404,
    VALIDATION_ERROR:    400,
    INVALID_TYPE:        400,
    INVALID_STATUS:      400,
    INVALID_STATE:       400,
    INVALID_TRANSITION:  422,
    PRECONDITION_FAILED: 422,
    ALREADY_ASSIGNED:    409,
    CAPACITY_EXCEEDED:   409,
  };
  const status = codeMap[err.code] || 500;
  return { status, body: { error: { code: err.code || 'INTERNAL_ERROR', message: err.message } } };
}

// Simple path matcher: returns params object or null
function matchPath(pattern, pathname) {
  const pParts = pattern.split('/');
  const rParts = pathname.split('/');
  if (pParts.length !== rParts.length) return null;
  const params = {};
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i].startsWith(':')) {
      params[pParts[i].slice(1)] = rParts[i];
    } else if (pParts[i] !== rParts[i]) {
      return null;
    }
  }
  return params;
}

function createWosRouter({ wos, dashboard }) {
  if (!wos) throw new Error('wos (WOS core) is required');

  return {
    async dispatch(method, pathname, tenantId, body = {}, actor = { actor_type: 'SYSTEM', actor_id: 'api' }, query = {}) {
      try {
        return await _dispatch(method, pathname, tenantId, body, actor, query, { wos, dashboard });
      } catch (err) {
        return handleDomainErr(err);
      }
    },
  };
}

async function _dispatch(method, pathname, tenantId, body, actor, query, { wos, dashboard }) {
  let params;

  // ── Projects ────────────────────────────────────────────────────────────────

  if (method === 'POST' && pathname === '/api/wos/projects') {
    const project = await wos.projects.create({ tenant_id: tenantId, actor, ...body });
    return created(project);
  }

  if (method === 'GET' && pathname === '/api/wos/projects') {
    const list = await wos.projects.list(tenantId);
    return ok({ projects: list, count: list.length });
  }

  params = matchPath('/api/wos/projects/:project_id', pathname);
  if (params && method === 'GET') {
    const p = await wos.projects.get(params.project_id);
    if (!p || p.tenant_id !== tenantId) return notFound('Project', params.project_id);
    return ok(p);
  }

  params = matchPath('/api/wos/projects/:project_id/status', pathname);
  if (params && method === 'POST') {
    const { status } = body;
    if (!status) return badRequest('status is required');
    const p = await wos.projects.setStatus(params.project_id, status, { actor });
    return ok(p);
  }

  // ── Workstreams ──────────────────────────────────────────────────────────────

  if (method === 'POST' && pathname === '/api/wos/workstreams') {
    const ws = await wos.workstreams.create({ tenant_id: tenantId, actor, ...body });
    return created(ws);
  }

  if (method === 'GET' && pathname === '/api/wos/workstreams') {
    const list = await wos.workstreams.list(tenantId, query.project_id);
    return ok({ workstreams: list, count: list.length });
  }

  params = matchPath('/api/wos/workstreams/:id', pathname);
  if (params && method === 'GET') {
    const ws = await wos.workstreams.get(params.id);
    if (!ws || ws.tenant_id !== tenantId) return notFound('Workstream', params.id);
    return ok(ws);
  }

  // ── Milestones ───────────────────────────────────────────────────────────────

  if (method === 'POST' && pathname === '/api/wos/milestones') {
    const m = await wos.milestones.create({ tenant_id: tenantId, actor, ...body });
    return created(m);
  }

  if (method === 'GET' && pathname === '/api/wos/milestones') {
    const list = await wos.milestones.list(tenantId, query.workstream_id);
    return ok({ milestones: list, count: list.length });
  }

  params = matchPath('/api/wos/milestones/:id', pathname);
  if (params && method === 'GET') {
    const m = await wos.milestones.get(params.id);
    if (!m || m.tenant_id !== tenantId) return notFound('Milestone', params.id);
    return ok(m);
  }

  params = matchPath('/api/wos/milestones/:id/complete', pathname);
  if (params && method === 'POST') {
    const m = await wos.milestones.complete(params.id, { actor, ...body });
    return ok(m);
  }

  // ── Workers ──────────────────────────────────────────────────────────────────

  if (method === 'POST' && pathname === '/api/wos/workers') {
    const w = await wos.workers.create({ tenant_id: tenantId, ...body });
    return created(w);
  }

  if (method === 'GET' && pathname === '/api/wos/workers') {
    const list = await wos.workers.list(tenantId);
    return ok({ workers: list, count: list.length });
  }

  params = matchPath('/api/wos/workers/:id', pathname);
  if (params && method === 'GET') {
    const w = await wos.workers.get(params.id);
    if (!w || w.tenant_id !== tenantId) return notFound('Worker', params.id);
    return ok(w);
  }

  params = matchPath('/api/wos/workers/:id', pathname);
  if (params && method === 'PATCH') {
    const w = await wos.workers.patch(params.id, body);
    return ok(w);
  }

  params = matchPath('/api/wos/workers/:id/status', pathname);
  if (params && method === 'POST') {
    const { status } = body;
    if (!status) return badRequest('status is required');
    const w = await wos.workers.setStatus(params.id, status);
    return ok(w);
  }

  // ── Pods ─────────────────────────────────────────────────────────────────────

  if (method === 'POST' && pathname === '/api/wos/pods') {
    const p = await wos.pods.create({ tenant_id: tenantId, ...body });
    return created(p);
  }

  if (method === 'GET' && pathname === '/api/wos/pods') {
    const list = await wos.pods.list(tenantId);
    return ok({ pods: list, count: list.length });
  }

  params = matchPath('/api/wos/pods/:id', pathname);
  if (params && method === 'GET') {
    const p = await wos.pods.get(params.id);
    if (!p || p.tenant_id !== tenantId) return notFound('Pod', params.id);
    return ok(p);
  }

  // ── Assignments ───────────────────────────────────────────────────────────────

  if (method === 'POST' && pathname === '/api/wos/assignments') {
    const a = await wos.assignments.create({ tenant_id: tenantId, ...body });
    return created(a);
  }

  if (method === 'GET' && pathname === '/api/wos/assignments') {
    const list = await wos.assignments.list(tenantId);
    return ok({ assignments: list, count: list.length });
  }

  params = matchPath('/api/wos/assignments/:id/deactivate', pathname);
  if (params && method === 'POST') {
    const a = await wos.assignments.deactivate(params.id);
    return ok(a);
  }

  // ── Execution Jobs ────────────────────────────────────────────────────────────

  if (method === 'POST' && pathname === '/api/wos/execution-jobs') {
    const j = await wos.executionJobs.create({ tenant_id: tenantId, actor, ...body });
    return created(j);
  }

  if (method === 'GET' && pathname === '/api/wos/execution-jobs') {
    const list = await wos.executionJobs.list(tenantId, query.milestone_id);
    return ok({ execution_jobs: list, count: list.length });
  }

  params = matchPath('/api/wos/execution-jobs/:id/complete', pathname);
  if (params && method === 'POST') {
    const j = await wos.executionJobs.complete(params.id, { actor, ...body });
    return ok(j);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  if (method === 'GET' && pathname === '/api/wos/dashboard') {
    if (!dashboard) return ok(defaultDashboard(tenantId));
    return ok(dashboard.getState(tenantId));
  }

  return null; // no match
}

function defaultDashboard(tenant_id) {
  return {
    tenant_id,
    project_count: 0,
    workstream_count: 0,
    milestone_open_count: 0,
    milestone_completed_count: 0,
    execution_job_completed_count: 0,
    last_event_at: null,
    note: 'dashboard projection not wired',
  };
}

module.exports = {
  createWosRouter,
};
