import express from "express"
import {
  runWithRequestContext,
  resolveRequestIdFromHeaders,
  resolveActorIdFromHeaders,
  resolveOwnerIdFromHeaders,
} from "./runtime/requestContext"
import { workspacesRouter } from "./workspaces/workspaces.routes"
import { podsRouter } from "./pods/pods.routes"
import { podRoleAssignmentsRouter } from "./pods/podRoleAssignments.routes"

const app = express()
app.use(express.json())

app.use((req, res, next) => {
  const requestId = resolveRequestIdFromHeaders(req.headers["x-request-id"])
  const actorId = resolveActorIdFromHeaders(req.headers["x-actor-id"])
  const ownerId = resolveOwnerIdFromHeaders(req.headers["x-owner-id"])

  res.setHeader("x-request-id", requestId)

  runWithRequestContext({ requestId, actorId, ownerId }, () => {
    next()
  })
})

app.get("/health", (_req, res) => {
  res.json({ ok: true })
})

app.use("/api/workspaces", workspacesRouter)
app.use("/api/pods", podsRouter)
app.use("/api/pod-role-assignments", podRoleAssignmentsRouter)

const port = process.env.PORT ? Number(process.env.PORT) : 3005

app.listen(port, () => {
  console.log(`prowork api listening on http://127.0.0.1:${port}`)
})
