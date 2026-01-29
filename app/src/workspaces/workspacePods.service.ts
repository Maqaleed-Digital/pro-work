import { db, type UUID, type PodRecord, type WorkspaceRecord } from "../db/inmemory"

function assertWorkspaceOwnedActive(ownerId: UUID, workspaceId: UUID): WorkspaceRecord {
  const ws = db.workspaces.get(workspaceId)
  if (!ws) throw new Error("workspace not found")
  if (ws.ownerId !== ownerId) throw new Error("workspace not found")
  if (ws.archivedAt) throw new Error("workspace archived")
  return ws
}

export type ListWorkspacePodsOptions = {
  includeArchivedPods?: boolean
}

export function listWorkspacePods(ownerId: UUID, workspaceId: UUID, opts?: ListWorkspacePodsOptions): PodRecord[] {
  assertWorkspaceOwnedActive(ownerId, workspaceId)

  const includeArchivedPods = Boolean(opts?.includeArchivedPods)
  const out: PodRecord[] = []

  for (const pod of db.pods.values()) {
    if (pod.ownerId !== ownerId) continue
    if (pod.workspaceId !== workspaceId) continue
    if (!includeArchivedPods && pod.archivedAt) continue
    out.push(pod)
  }

  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return out
}

export function getWorkspaceWithPods(
  ownerId: UUID,
  workspaceId: UUID,
  opts?: ListWorkspacePodsOptions
): { workspace: WorkspaceRecord; pods: PodRecord[] } {
  const ws = assertWorkspaceOwnedActive(ownerId, workspaceId)
  const pods = listWorkspacePods(ownerId, workspaceId, opts)
  return { workspace: ws, pods }
}
