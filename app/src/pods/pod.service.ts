import { db, type UUID, type PodRecord, type PodLifecycleState } from "../db/inmemory"
import { emitAuditEvent } from "../audit/audit.service"

function nowIso(): string {
  return new Date().toISOString()
}

function genId(): UUID {
  return `pod_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

export type CreatePodInput = {
  actorId: UUID
  ownerId: UUID
  workspaceId: UUID
  name_en: string
  name_ar?: string | null
  requestId?: string | null
}

export type UpdatePodInput = {
  actorId: UUID
  ownerId: UUID
  id: UUID
  name_en?: string
  name_ar?: string | null
  requestId?: string | null
}

export type SetPodLifecycleInput = {
  actorId: UUID
  ownerId: UUID
  id: UUID
  lifecycle: PodLifecycleState
  requestId?: string | null
}

export type ArchivePodInput = {
  actorId: UUID
  ownerId: UUID
  id: UUID
  requestId?: string | null
}

function assertWorkspaceOwned(ownerId: UUID, workspaceId: UUID): void {
  const ws = db.workspaces.get(workspaceId)
  if (!ws) throw new Error("workspace not found")
  if (ws.ownerId !== ownerId) throw new Error("workspace not found")
  if (ws.archivedAt) throw new Error("workspace archived")
}

export function createPod(input: CreatePodInput): PodRecord {
  if (!input.name_en || input.name_en.trim().length === 0) throw new Error("name_en is required")

  assertWorkspaceOwned(input.ownerId, input.workspaceId)

  const id = genId()
  const ts = nowIso()

  const record: PodRecord = {
    id,
    workspaceId: input.workspaceId,
    ownerId: input.ownerId,
    name_en: input.name_en.trim(),
    name_ar: input.name_ar ?? null,
    lifecycle: "draft",
    createdAt: ts,
    updatedAt: ts,
    archivedAt: null,
  }

  db.pods.set(id, record)

  emitAuditEvent({
    eventType: "pod.created",
    actorId: input.actorId,
    entityType: "workspace",
    entityId: input.workspaceId,
    before: null,
    after: record,
    requestId: input.requestId ?? null,
  })

  return record
}

export function getPodById(ownerId: UUID, id: UUID): PodRecord | null {
  const pod = db.pods.get(id)
  if (!pod) return null
  if (pod.ownerId !== ownerId) return null
  return pod
}

export function listPods(ownerId: UUID, workspaceId?: UUID, opts?: { includeArchived?: boolean }): PodRecord[] {
  const includeArchived = Boolean(opts?.includeArchived)
  const out: PodRecord[] = []

  for (const pod of db.pods.values()) {
    if (pod.ownerId !== ownerId) continue
    if (workspaceId && pod.workspaceId !== workspaceId) continue
    if (!includeArchived && pod.archivedAt) continue
    out.push(pod)
  }

  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return out
}

export function updatePod(input: UpdatePodInput): PodRecord {
  const existing = getPodById(input.ownerId, input.id)
  if (!existing) throw new Error("pod not found")

  const before = { ...existing }
  const next: PodRecord = {
    ...existing,
    name_en: input.name_en !== undefined ? input.name_en.trim() : existing.name_en,
    name_ar: input.name_ar !== undefined ? input.name_ar : existing.name_ar,
    updatedAt: nowIso(),
  }

  if (!next.name_en || next.name_en.trim().length === 0) throw new Error("name_en is required")

  db.pods.set(next.id, next)

  emitAuditEvent({
    eventType: "pod.updated",
    actorId: input.actorId,
    entityType: "workspace",
    entityId: next.workspaceId,
    before,
    after: next,
    requestId: input.requestId ?? null,
  })

  return next
}

const allowedTransitions: Record<PodLifecycleState, PodLifecycleState[]> = {
  draft: ["active", "archived"],
  active: ["paused", "completed", "archived"],
  paused: ["active", "archived"],
  completed: ["archived"],
  archived: [],
}

export function setPodLifecycle(input: SetPodLifecycleInput): PodRecord {
  const existing = getPodById(input.ownerId, input.id)
  if (!existing) throw new Error("pod not found")
  if (existing.archivedAt) throw new Error("pod archived")

  const from = existing.lifecycle
  const to = input.lifecycle
  const allowed = allowedTransitions[from] || []
  if (!allowed.includes(to)) throw new Error(`invalid lifecycle transition: ${from} -> ${to}`)

  const before = { ...existing }
  const next: PodRecord = { ...existing, lifecycle: to, updatedAt: nowIso() }

  db.pods.set(next.id, next)

  emitAuditEvent({
    eventType: "pod.lifecycle_changed",
    actorId: input.actorId,
    entityType: "workspace",
    entityId: next.workspaceId,
    before: { lifecycle: from },
    after: { lifecycle: to },
    requestId: input.requestId ?? null,
  })

  return next
}

export function archivePod(input: ArchivePodInput): PodRecord {
  const existing = getPodById(input.ownerId, input.id)
  if (!existing) throw new Error("pod not found")
  if (existing.archivedAt) return existing

  const before = { ...existing }
  const next: PodRecord = {
    ...existing,
    archivedAt: nowIso(),
    lifecycle: "archived",
    updatedAt: nowIso(),
  }

  db.pods.set(next.id, next)

  emitAuditEvent({
    eventType: "pod.archived",
    actorId: input.actorId,
    entityType: "workspace",
    entityId: next.workspaceId,
    before,
    after: next,
    requestId: input.requestId ?? null,
  })

  return next
}
