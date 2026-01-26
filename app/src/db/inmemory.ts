export type UUID = string

export type WorkspaceRecord = {
  id: UUID
  ownerId: UUID
  name_en: string
  name_ar?: string | null
  createdAt: string
  updatedAt: string
  archivedAt?: string | null
}

export type PodLifecycleState =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "archived"

export type PodRecord = {
  id: UUID
  workspaceId: UUID
  ownerId: UUID
  name_en: string
  name_ar?: string | null
  lifecycle: PodLifecycleState
  createdAt: string
  updatedAt: string
  archivedAt?: string | null
}

export type PodRole =
  | "pod_lead"
  | "specialist"
  | "qa"
  | "reviewer"

export type PodRoleAssignmentRecord = {
  id: UUID
  podId: UUID
  ownerId: UUID
  memberId: UUID
  role: PodRole
  assignedAt: string
  assignedBy: UUID
  unassignedAt?: string | null
}

export type AuditEvent = {
  id: UUID
  eventType: string
  actorId: UUID
  entityType: "workspace"
  entityId: UUID
  ts: string
  before?: unknown
  after?: unknown
  requestId?: string | null
}

export const db = {
  workspaces: new Map<UUID, WorkspaceRecord>(),
  pods: new Map<UUID, PodRecord>(),
  podRoleAssignments: new Map<UUID, PodRoleAssignmentRecord>(),
  audit: new Array<AuditEvent>(),
}
