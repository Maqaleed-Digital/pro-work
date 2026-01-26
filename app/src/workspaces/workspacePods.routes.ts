import { Router } from "express"
import { getRequestContext } from "../runtime/requestContext"
import { listWorkspacePods } from "./workspacePods.service"

function ctxOrThrow() {
  const ctx = getRequestContext()
  if (!ctx) throw new Error("request context missing")
  return ctx
}

function ok<T>(res: any, body: T) {
  res.status(200).json(body)
}

function badRequest(res: any, message: string) {
  res.status(400).json({ error: message })
}

function notFound(res: any) {
  res.status(404).json({ error: "not found" })
}

export const workspacePodsRouter = Router({ mergeParams: true })

workspacePodsRouter.get("/", (req, res) => {
  try {
    const ctx = ctxOrThrow()
    const workspaceId = req.params.id
    const includeArchivedPods = req.query?.includeArchivedPods === "true"

    const pods = listWorkspacePods(ctx.ownerId, workspaceId, { includeArchivedPods })
    ok(res, pods)
  } catch (e: any) {
    const msg = e?.message ?? "error"
    if (msg === "workspace not found") return notFound(res)
    badRequest(res, msg)
  }
})
