import { db, type UUID, type WorkspaceRecord } from "../db/inmemory"
import { emitAuditEvent } from "../audit/audit.service"

function nowIso(): string {
  return new Date().toISOString()
}

function genId(): UUID {
  return `ws_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

export type CreateWorkspaceInput = {
  actorId: UUID
  ownerId: UUID
  name_en: string
  name_ar?: string | null
  requestId?: string | null
}

export type UpdateWorkspaceInput = {
  actorId: UUID
  ownerId: UUID
  id: UUID
  name_en?: string
  name_ar?: string | null
  requestId?: string | null
}

export type ArchiveWorkspaceInput = {
  actorId: UUID
  ownerId: UUID
  id: UUID
  requestId?: string | null
}

export function createWorkspace(input: CreateWorkspaceInput): WorkspaceRecord {
  if (!input.name_en || input.name_en.trim().length === 0) throw new Error("name_en is required")

  const id = genId()
  const ts = nowIso()

  const record: WorkspaceRecord = {
    id,
    ownerId: input.ownerId,
    name_en: input.name_en.trim(),
    name_ar: input.name_ar ?? null,
    createdAt: ts,
    updatedAt: ts,
    archivedAt: null,
  }

  db.workspaces.set(id, record)

  emitAuditEvent({
    eventType: "workspace.created",
    actorId: input.actorId,
    entityType: "workspace",
    entityId: id,
    before: null,
    after: record,
    requestId: input.requestId ?? null,
  })

  return record
}

export function getWorkspaceById(ownerId: UUID, id: UUID): WorkspaceRecord | null {
  const ws = db.workspaces.get(id)
  if (!ws) return null
  if (ws.ownerId !== ownerId) return null
  return ws
}

export function listWorkspaces(ownerId: UUID, opts?: { includeArchived?: boolean }): WorkspaceRecord[] {
  const includeArchived = Boolean(opts?.includeArchived)
  const out: WorkspaceRecord[] = []

  for (const ws of db.workspaces.values()) {
    if (ws.ownerId !== ownerId) continue
    if (!includeArchived && ws.archivedAt) continue
    out.push(ws)
  }

  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return out
}

export function updateWorkspace(input: UpdateWorkspaceInput): WorkspaceRecord {
  const existing = getWorkspaceById(input.ownerId, input.id)
  if (!existing) throw new Error("workspace not found")

  const before = { ...existing }
  const next: WorkspaceRecord = {
    ...existing,
    name_en: input.name_en !== undefined ? input.name_en.trim() : existing.name_en,
    name_ar: input.name_ar !== undefined ? input.name_ar : existing.name_ar,
    updatedAt: nowIso(),
  }

  if (!next.name_en || next.name_en.trim().length === 0) throw new Error("name_en is required")

  db.workspaces.set(next.id, next)

  emitAuditEvent({
    eventType: "workspace.updated",
    actorId: input.actorId,
    entityType: "workspace",
    entityId: next.id,
    before,
    after: next,
    requestId: input.requestId ?? null,
  })

  return next
}

export function archiveWorkspace(input: ArchiveWorkspaceInput): WorkspaceRecord {
  const existing = getWorkspaceById(input.ownerId, input.id)
  if (!existing) throw new Error("workspace not found")
  if (existing.archivedAt) return existing

  const before = { ...existing }
  const next: WorkspaceRecord = {
    ...existing,
    archivedAt: nowIso(),
    updatedAt: nowIso(),
  }

  db.workspaces.set(next.id, next)

  emitAuditEvent({
    eventType: "workspace.archived",
    actorId: input.actorId,
    entityType: "workspace",
    entityId: next.id,
    before,
    after: next,
    requestId: input.requestId ?? null,
  })

  return next
}
