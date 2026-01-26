import { describe, it, expect, beforeEach } from "vitest"
import { db } from "../db/inmemory"
import { listAuditEvents } from "../audit/audit.service"
import { createWorkspace } from "../workspaces/workspace.service"
import { createPod } from "./pod.service"
import { assignPodRole, listPodAssignments, unassignPodRole } from "./podRoleAssignments.service"

describe("pod role assignments", () => {
  const ownerA = "owner_A"
  const ownerB = "owner_B"
  const actorA = "actor_A"
  const member1 = "member_1"

  beforeEach(() => {
    db.workspaces.clear()
    db.pods.clear()
    db.podRoleAssignments.clear()
    db.audit.length = 0
  })

  it("assigns a role to a member and emits audit", () => {
    const ws = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "W1" })
    const pod = createPod({ actorId: actorA, ownerId: ownerA, workspaceId: ws.id, name_en: "Pod 1" })

    const a = assignPodRole({ actorId: actorA, ownerId: ownerA, podId: pod.id, memberId: member1, role: "specialist" })
    expect(a.podId).toBe(pod.id)
    expect(a.role).toBe("specialist")
    expect(a.unassignedAt).toBeNull()

    const events = listAuditEvents()
    expect(events.some(e => e.eventType === "pod.role_assigned")).toBe(true)
  })

  it("lists active assignments only by default", () => {
    const ws = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "W1" })
    const pod = createPod({ actorId: actorA, ownerId: ownerA, workspaceId: ws.id, name_en: "Pod 1" })

    const a = assignPodRole({ actorId: actorA, ownerId: ownerA, podId: pod.id, memberId: member1, role: "qa" })
    unassignPodRole({ actorId: actorA, ownerId: ownerA, assignmentId: a.id })

    expect(listPodAssignments(ownerA, pod.id).length).toBe(0)
    expect(listPodAssignments(ownerA, pod.id, { includeUnassigned: true }).length).toBe(1)
  })

  it("prevents cross-owner access", () => {
    const wsA = createWorkspace({ actorId: actorA, ownerId: ownerA, name_en: "WA" })
    const podA = createPod({ actorId: actorA, ownerId: ownerA, workspaceId: wsA.id, name_en: "Pod A" })

    expect(() =>
      assignPodRole({ actorId: actorA, ownerId: ownerB, podId: podA.id, memberId: member1, role: "pod_lead" })
    ).toThrow()
  })
})
