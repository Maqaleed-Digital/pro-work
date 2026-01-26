import { describe, it, expect, beforeEach } from "vitest"
import { db } from "../db/inmemory"
import { listAuditEvents } from "../audit/audit.service"
import { createWorkspace, listWorkspaces, getWorkspaceById, updateWorkspace, archiveWorkspace } from "./workspace.service"

describe("workspace service", () => {
  const ownerA = "owner_A"
  const ownerB = "owner_B"
  const actorA = "actor_A"

  beforeEach(() => {
    db.workspaces.clear()
    db.audit.length = 0
  })

  it("creates a workspace and emits audit", () => {
    const ws = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "Client Workspace", name_ar: "مساحة العميل" })
    expect(ws.id).toMatch(/^ws_/)
    expect(ws.ownerId).toBe(ownerA)

    const events = listAuditEvents()
    expect(events.length).toBe(1)
    expect(events[0].eventType).toBe("workspace.created")
    expect(events[0].entityId).toBe(ws.id)
  })

  it("lists only owner workspaces", () => {
    createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "A1" })
    createWorkspace({ actorId: actorA, ownerId: ownerB, name_en: "B1" })
    createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "A2" })

    const listA = listWorkspaces(ownerA)
    expect(listA.map(x => x.name_en)).toEqual(["A1", "A2"])

    const listB = listWorkspaces(ownerB)
    expect(listB.map(x => x.name_en)).toEqual(["B1"])
  })

  it("prevents cross-owner access (returns null)", () => {
    const ws = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "A1" })
    expect(getWorkspaceById(ownerB, ws.id)).toBeNull()
  })

  it("updates a workspace and emits audit", () => {
    const ws = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "A1" })
    const updated = updateWorkspace({ actorId: actorA, ownerId: ownerA, id: ws.id, name_en: "A1 updated" })
    expect(updated.name_en).toBe("A1 updated")

    const events = listAuditEvents()
    expect(events.map(e => e.eventType)).toEqual(["workspace.created", "workspace.updated"])
  })

  it("archives a workspace, hides from active list, emits audit", () => {
    const ws = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "A1" })
    archiveWorkspace({ actorId: actorA, ownerId: ownerA, id: ws.id })

    const active = listWorkspaces(ownerA)
    expect(active.length).toBe(0)

    const all = listWorkspaces(ownerA, { includeArchived: true })
    expect(all.length).toBe(1)
    expect(all[0].archivedAt).toBeTruthy()

    const events = listAuditEvents()
    expect(events.map(e => e.eventType)).toEqual(["workspace.created", "workspace.archived"])
  })
})
