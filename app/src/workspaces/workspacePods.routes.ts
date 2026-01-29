import { Router, type Request, type Response } from "express";
import { getRequestContext } from "../runtime/requestContext";
import { listWorkspacePods } from "./workspacePods.service";

type IdParams = {
  id: string;
};

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function resolveOwnerId(): string | null {
  const ctx = getRequestContext();

  const bag = ctx as unknown as Record<string, unknown>;

  return (
    pickString(bag.ownerId) ??
    pickString(bag.owner_id) ??
    pickString(bag.actorId) ??
    pickString(bag.actor_id) ??
    pickString(bag.userId) ??
    pickString(bag.user_id) ??
    null
  );
}

export const workspacePodsRouter = Router();

workspacePodsRouter.get(
  "/api/workspaces/:id/pods",
  (req: Request<IdParams>, res: Response) => {
    const workspaceIdRaw = req.params.id;
    const ownerIdRaw = resolveOwnerId();

    if (!ownerIdRaw) {
      return res.status(401).json({
        ok: false,
        error: { code: "unauthorized", message: "missing owner context" },
        time: new Date().toISOString(),
        service: "pro-work"
      });
    }

    type OwnerId = Parameters<typeof listWorkspacePods>[0];
    type WorkspaceId = Parameters<typeof listWorkspacePods>[1];

    const ownerId = ownerIdRaw as unknown as OwnerId;
    const workspaceId = workspaceIdRaw as unknown as WorkspaceId;

    const pods = listWorkspacePods(ownerId, workspaceId);

    return res.status(200).json({
      ok: true,
      owner_id: ownerIdRaw,
      workspace_id: workspaceIdRaw,
      pods,
      time: new Date().toISOString(),
      service: "pro-work"
    });
  }
);
