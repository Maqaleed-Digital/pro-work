import { db, type AuditEvent, type UUID } from "../db/inmemory"

function nowIso(): string {
  return new Date().toISOString()
}

function genId(): UUID {
  return `evt_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

export function emitAuditEvent(input: Omit<AuditEvent, "id" | "ts">): AuditEvent {
  const event: AuditEvent = {
    id: genId(),
    ts: nowIso(),
    ...input,
  }
  db.audit.push(event)
  return event
}

export function listAuditEvents(): AuditEvent[] {
  return [...db.audit]
}
