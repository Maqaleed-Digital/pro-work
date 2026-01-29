import { db, type UUID, type PodRole, type PodRoleAssignmentRecord } from "../db/inmemory"
import { emitAuditEvent } from "../audit/audit.service"

function nowIso(): string {
  return new Date().toISOString()
}

function genId(prefix: string): UUID {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

function assertPodOwned(ownerId: UUID, podId: UUID): void {
  const pod = db.pods.get(podId)
  if (!pod) throw new Error("pod not found")
  if (pod.ownerId !== ownerId) throw new Error("pod not found")
  if (pod.archivedAt) throw new Error("pod archived")
}

export type AssignPodRoleInput = {
  actorId: UUID
  ownerId: UUID
  podId: UUID
  memberId: UUID
  role: PodRole
  requestId?: string | null
}

export type UnassignPodRoleInput = {
  actorId: UUID
  ownerId: UUID
  assignmentId: UUID
  requestId?: string | null
}

export function assignPodRole(input: AssignPodRoleInput): PodRoleAssignmentRecord {
  assertPodOwned(input.ownerId, input.podId)

  const id = genId("podrole")
  const ts = nowIso()

  const record: PodRoleAssignmentRecord = {
    id,
    podId: input.podId,
    ownerId: input.ownerId,
    memberId: input.memberId,
    role: input.role,
    assignedAt: ts,
    assignedBy: input.actorId,
    unassignedAt: null,
  }

  db.podRoleAssignments.set(id, record)

  const pod = db.pods.get(input.podId)
  const workspaceId = pod ? pod.workspaceId : input.podId

  emitAuditEvent({
    eventType: "pod.role_assigned",
    actorId: input.actorId,
    entityType: "workspace",
    entityId: workspaceId,
    before: null,
    after: record,
    requestId: input.requestId ?? null,
  })

  return record
}

export function listPodAssignments(ownerId: UUID, podId: UUID, opts?: { includeUnassigned?: boolean }): PodRoleAssignmentRecord[] {
  assertPodOwned(ownerId, podId)

  const includeUnassigned = Boolean(opts?.includeUnassigned)
  const out: PodRoleAssignmentRecord[] = []

  for (const a of db.podRoleAssignments.values()) {
    if (a.ownerId !== ownerId) continue
    if (a.podId !== podId) continue
    if (!includeUnassigned && a.unassignedAt) continue
    out.push(a)
  }

  out.sort((x, y) => x.assignedAt.localeCompare(y.assignedAt))
  return out
}

export function unassignPodRole(input: UnassignPodRoleInput): PodRoleAssignmentRecord {
  const existing = db.podRoleAssignments.get(input.assignmentId)
  if (!existing) throw new Error("assignment not found")
  if (existing.ownerId !== input.ownerId) throw new Error("assignment not found")

  assertPodOwned(input.ownerId, existing.podId)

  if (existing.unassignedAt) return existing

  const before = { ...existing }
  const next: PodRoleAssignmentRecord = { ...existing, unassignedAt: nowIso() }

  db.podRoleAssignments.set(next.id, next)

  const pod = db.pods.get(existing.podId)
  const workspaceId = pod ? pod.workspaceId : existing.podId

  emitAuditEvent({
    eventType: "pod.role_unassigned",
    actorId: input.actorId,
    entityType: "workspace",
    entityId: workspaceId,
    before,
    after: next,
    requestId: input.requestId ?? null,
  })

  return next
}
