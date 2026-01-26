import { Router } from "express"
import { getRequestContext } from "../runtime/requestContext"
import {
  createWorkspace,
  listWorkspaces,
  getWorkspaceById,
  updateWorkspace,
  archiveWorkspace,
} from "./workspace.service"

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

export const workspacesRouter = Router()

workspacesRouter.post("/", (req, res) => {
  try {
    const ctx = ctxOrThrow()
    const name_en = typeof req.body?.name_en === "string" ? req.body.name_en : ""
    const name_ar = req.body?.name_ar ?? null

    if (!name_en || String(name_en).trim().length === 0) return badRequest(res, "name_en is required")

    const ws = createWorkspace({
      actorId: ctx.actorId,
      ownerId: ctx.ownerId,
      name_en,
      name_ar,
    })

    ok(res, ws)
  } catch (e: any) {
    badRequest(res, e?.message ?? "error")
  }
})

workspacesRouter.get("/", (req, res) => {
  try {
    const ctx = ctxOrThrow()
    const includeArchived = req.query?.includeArchived === "true"
    const list = listWorkspaces(ctx.ownerId, { includeArchived })
    ok(res, list)
  } catch (e: any) {
    badRequest(res, e?.message ?? "error")
  }
})

workspacesRouter.get("/:id", (req, res) => {
  try {
    const ctx = ctxOrThrow()
    const ws = getWorkspaceById(ctx.ownerId, req.params.id)
    if (!ws) return notFound(res)
    ok(res, ws)
  } catch (e: any) {
    badRequest(res, e?.message ?? "error")
  }
})

workspacesRouter.patch("/:id", (req, res) => {
  try {
    const ctx = ctxOrThrow()
    const name_en = req.body?.name_en
    const name_ar = req.body?.name_ar

    const ws = updateWorkspace({
      actorId: ctx.actorId,
      ownerId: ctx.ownerId,
      id: req.params.id,
      name_en,
      name_ar,
    })

    ok(res, ws)
  } catch (e: any) {
    const msg = e?.message ?? "error"
    if (msg === "workspace not found") return notFound(res)
    badRequest(res, msg)
  }
})

workspacesRouter.post("/:id/archive", (req, res) => {
  try {
    const ctx = ctxOrThrow()
    const ws = archiveWorkspace({
      actorId: ctx.actorId,
      ownerId: ctx.ownerId,
      id: req.params.id,
    })
    ok(res, ws)
  } catch (e: any) {
    const msg = e?.message ?? "error"
    if (msg === "workspace not found") return notFound(res)
    badRequest(res, msg)
  }
})
