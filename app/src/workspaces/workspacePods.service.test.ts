import { describe, it, expect, beforeEach } from "vitest"
import { db } from "../db/inmemory"
import { createWorkspace, archiveWorkspace } from "./workspace.service"
import { createPod, archivePod } from "../pods/pod.service"
import { listWorkspacePods, getWorkspaceWithPods } from "./workspacePods.service"

describe("workspace-pod relations", () => {
  const ownerA = "owner_A"
  const ownerB = "owner_B"
  const actorA = "actor_A"

  beforeEach(() => {
    db.workspaces.clear()
    db.pods.clear()
    db.podRoleAssignments.clear()
    db.audit.length = 0
  })

  it("lists pods scoped to a workspace", () => {
    const ws1 = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "W1" })
    const ws2 = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "W2" })

    const p1 = createPod({ actorId: actorA, ownerId: ownerA, workspaceId: ws1.id, name_en: "P1" })
    createPod({ actorId: actorA, ownerId: ownerA, workspaceId: ws1.id, name_en: "P2" })
    createPod({ actorId: actorA, ownerId: ownerA, workspaceId: ws2.id, name_en: "P3" })

    const podsW1 = listWorkspacePods(ownerA, ws1.id)
    expect(podsW1.map(p => p.name_en)).toEqual(["P1", "P2"])
    expect(podsW1.some(p => p.id === p1.id)).toBe(true)
  })

  it("prevents cross-owner access to workspace pods", () => {
    const wsA = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "WA" })
    createPod({ actorId: actorA, ownerId: ownerA, workspaceId: wsA.id, name_en: "P1" })

    expect(() => listWorkspacePods(ownerB, wsA.id)).toThrow()
  })

  it("rejects listing pods for an archived workspace", () => {
    const ws = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "W1" })
    createPod({ actorId: actorA, ownerId: ownerA, workspaceId: ws.id, name_en: "P1" })

    archiveWorkspace({ actorId: actorA, ownerId: ownerA, id: ws.id })

    expect(() => listWorkspacePods(ownerA, ws.id)).toThrow()
  })

  it("supports includeArchivedPods option", () => {
    const ws = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "W1" })
    const pod = createPod({ actorId: actorA, ownerId: ownerA, workspaceId: ws.id, name_en: "P1" })

    archivePod({ actorId: actorA, ownerId: ownerA, id: pod.id })

    expect(listWorkspacePods(ownerA, ws.id).length).toBe(0)
    expect(listWorkspacePods(ownerA, ws.id, { includeArchivedPods: true }).length).toBe(1)
  })

  it("returns workspace with pods (composed read model)", () => {
    const ws = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "W1" })
    createPod({ actorId: actorA, ownerId: ownerA, workspaceId: ws.id, name_en: "P1" })
    createPod({ actorId: actorA, ownerId: ownerA, workspaceId: ws.id, name_en: "P2" })

    const res = getWorkspaceWithPods(ownerA, ws.id)
    expect(res.workspace.id).toBe(ws.id)
    expect(res.pods.map(p => p.name_en)).toEqual(["P1", "P2"])
  })
})
