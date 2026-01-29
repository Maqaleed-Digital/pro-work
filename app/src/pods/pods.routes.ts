import { Router } from "express"
import { getRequestContext } from "../runtime/requestContext"
import { createPod, listPods, getPodById, updatePod, setPodLifecycle, archivePod } from "./pod.service"

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

export const podsRouter = Router()

podsRouter.post("/", (req, res) => {
  try {
    const ctx = ctxOrThrow()
    const workspaceId = typeof req.body?.workspaceId === "string" ? req.body.workspaceId : ""
    const name_en = typeof req.body?.name_en === "string" ? req.body.name_en : ""
    const name_ar = req.body?.name_ar ?? null

    if (!workspaceId || workspaceId.trim().length === 0) return badRequest(res, "workspaceId is required")
    if (!name_en || name_en.trim().length === 0) return badRequest(res, "name_en is required")

    const pod = createPod({
      actorId: ctx.actorId,
      ownerId: ctx.ownerId,
      workspaceId,
      name_en,
      name_ar,
    })

    ok(res, pod)
  } catch (e: any) {
    badRequest(res, e?.message ?? "error")
  }
})

podsRouter.get("/", (req, res) => {
  try {
    const ctx = ctxOrThrow()
    const workspaceId = typeof req.query?.workspaceId === "string" ? req.query.workspaceId : undefined
    const includeArchived = req.query?.includeArchived === "true"

    const list = listPods(ctx.ownerId, workspaceId, { includeArchived })
    ok(res, list)
  } catch (e: any) {
    badRequest(res, e?.message ?? "error")
  }
})

podsRouter.get("/:id", (req, res) => {
  try {
    const ctx = ctxOrThrow()
    const pod = getPodById(ctx.ownerId, req.params.id)
    if (!pod) return notFound(res)
    ok(res, pod)
  } catch (e: any) {
    badRequest(res, e?.message ?? "error")
  }
})

podsRouter.patch("/:id", (req, res) => {
  try {
    const ctx = ctxOrThrow()
    const name_en = req.body?.name_en
    const name_ar = req.body?.name_ar

    const pod = updatePod({
      actorId: ctx.actorId,
      ownerId: ctx.ownerId,
      id: req.params.id,
      name_en,
      name_ar,
    })

    ok(res, pod)
  } catch (e: any) {
    const msg = e?.message ?? "error"
    if (msg === "pod not found") return notFound(res)
    badRequest(res, msg)
  }
})

podsRouter.post("/:id/lifecycle", (req, res) => {
  try {
    const ctx = ctxOrThrow()
    const lifecycle = typeof req.body?.lifecycle === "string" ? req.body.lifecycle : ""

    if (!lifecycle || lifecycle.trim().length === 0) return badRequest(res, "lifecycle is required")

    const pod = setPodLifecycle({
      actorId: ctx.actorId,
      ownerId: ctx.ownerId,
      id: req.params.id,
      lifecycle: lifecycle as any,
    })

    ok(res, pod)
  } catch (e: any) {
    const msg = e?.message ?? "error"
    if (msg === "pod not found") return notFound(res)
    badRequest(res, msg)
  }
})

podsRouter.post("/:id/archive", (req, res) => {
  try {
    const ctx = ctxOrThrow()
    const pod = archivePod({
      actorId: ctx.actorId,
      ownerId: ctx.ownerId,
      id: req.params.id,
    })
    ok(res, pod)
  } catch (e: any) {
    const msg = e?.message ?? "error"
    if (msg === "pod not found") return notFound(res)
    badRequest(res, msg)
  }
})
