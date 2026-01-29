import { describe, it, expect, beforeEach } from "vitest"
import { db } from "../db/inmemory"
import { listAuditEvents } from "../audit/audit.service"
import { createWorkspace } from "../workspaces/workspace.service"
import { createPod, listPods, getPodById, updatePod, setPodLifecycle, archivePod } from "./pod.service"

describe("pod service", () => {
  const ownerA = "owner_A"
  const ownerB = "owner_B"
  const actorA = "actor_A"

  beforeEach(() => {
    db.workspaces.clear()
    db.pods.clear()
    db.audit.length = 0
  })

  it("creates pod under owned workspace and emits audit", () => {
    const ws = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "W1" })
    const pod = createPod({ actorId: actorA, ownerId: ownerA, workspaceId: ws.id, name_en: "Pod 1" })

    expect(pod.id).toMatch(/^pod_/)
    expect(pod.workspaceId).toBe(ws.id)
    expect(pod.lifecycle).toBe("draft")

    const events = listAuditEvents()
    expect(events.some(e => e.eventType === "pod.created")).toBe(true)
  })

  it("prevents creating pod in another owner's workspace", () => {
    const wsB = createWorkspace({ actorId: actorA, ownerId: ownerB, name_en: "WB" })
    expect(() => createPod({ actorId: actorA, ownerId: ownerA, workspaceId: wsB.id, name_en: "Pod X" })).toThrow()
  })

  it("lists only owner pods", () => {
    const wsA = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "WA" })
    const wsB = createWorkspace({ actorId: actorA, ownerId: ownerB, name_en: "WB" })

    createPod({ actorId: actorA, ownerId: ownerA, workspaceId: wsA.id, name_en: "A1" })
    createPod({ actorId: actorA, ownerId: ownerB, workspaceId: wsB.id, name_en: "B1" })
    createPod({ actorId: actorA, ownerId: ownerA, workspaceId: wsA.id, name_en: "A2" })

    expect(listPods(ownerA).map(x => x.name_en)).toEqual(["A1", "A2"])
    expect(listPods(ownerB).map(x => x.name_en)).toEqual(["B1"])
  })

  it("updates pod and enforces isolation", () => {
    const wsA = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "WA" })
    const pod = createPod({ actorId: actorA, ownerId: ownerA, workspaceId: wsA.id, name_en: "A1" })

    const updated = updatePod({ actorId: actorA, ownerId: ownerA, id: pod.id, name_en: "A1+" })
    expect(updated.name_en).toBe("A1+")
    expect(getPodById(ownerB, pod.id)).toBeNull()
  })

  it("validates lifecycle transitions", () => {
    const wsA = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "WA" })
    const pod = createPod({ actorId: actorA, ownerId: ownerA, workspaceId: wsA.id, name_en: "A1" })

    const active = setPodLifecycle({ actorId: actorA, ownerId: ownerA, id: pod.id, lifecycle: "active" })
    expect(active.lifecycle).toBe("active")

    expect(() => setPodLifecycle({ actorId: actorA, ownerId: ownerA, id: pod.id, lifecycle: "draft" })).toThrow()
  })

  it("archives pod and hides from active list", () => {
    const wsA = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "WA" })
    const pod = createPod({ actorId: actorA, ownerId: ownerA, workspaceId: wsA.id, name_en: "A1" })

    archivePod({ actorId: actorA, ownerId: ownerA, id: pod.id })
    expect(listPods(ownerA).length).toBe(0)
    expect(listPods(ownerA, undefined, { includeArchived: true }).length).toBe(1)
  })
})
