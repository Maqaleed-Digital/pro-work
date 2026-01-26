import { Router } from "express"
import { getRequestContext } from "../runtime/requestContext"
import { assignPodRole, listPodAssignments, unassignPodRole } from "./podRoleAssignments.service"

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

export const podRoleAssignmentsRouter = Router()

podRoleAssignmentsRouter.post("/", (req, res) => {
  try {
    const ctx = ctxOrThrow()
    const podId = typeof req.body?.podId === "string" ? req.body.podId : ""
    const memberId = typeof req.body?.memberId === "string" ? req.body.memberId : ""
    const role = typeof req.body?.role === "string" ? req.body.role : ""

    if (!podId || podId.trim().length === 0) return badRequest(res, "podId is required")
    if (!memberId || memberId.trim().length === 0) return badRequest(res, "memberId is required")
    if (!role || role.trim().length === 0) return badRequest(res, "role is required")

    const a = assignPodRole({
      actorId: ctx.actorId,
      ownerId: ctx.ownerId,
      podId,
      memberId,
      role: role as any,
    })

    ok(res, a)
  } catch (e: any) {
    badRequest(res, e?.message ?? "error")
  }
})

podRoleAssignmentsRouter.get("/", (req, res) => {
  try {
    const ctx = ctxOrThrow()
    const podId = typeof req.query?.podId === "string" ? req.query.podId : ""
    if (!podId || podId.trim().length === 0) return badRequest(res, "podId is required")

    const includeUnassigned = req.query?.includeUnassigned === "true"
    const list = listPodAssignments(ctx.ownerId, podId, { includeUnassigned })

    ok(res, list)
  } catch (e: any) {
    badRequest(res, e?.message ?? "error")
  }
})

podRoleAssignmentsRouter.post("/:assignmentId/unassign", (req, res) => {
  try {
    const ctx = ctxOrThrow()
    const a = unassignPodRole({
      actorId: ctx.actorId,
      ownerId: ctx.ownerId,
      assignmentId: req.params.assignmentId,
    })

    ok(res, a)
  } catch (e: any) {
    const msg = e?.message ?? "error"
    if (msg === "assignment not found") return notFound(res)
    badRequest(res, msg)
  }
})
