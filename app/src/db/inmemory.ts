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
  audit: new Array<AuditEvent>(),
}
