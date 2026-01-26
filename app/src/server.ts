import express from "express"
import { runWithRequestContext, resolveRequestIdFromHeaders } from "./runtime/requestContext"

const app = express()
app.use(express.json())

app.use((req, res, next) => {
  const requestId = resolveRequestIdFromHeaders(req.headers["x-request-id"])
  res.setHeader("x-request-id", requestId)

  runWithRequestContext({ requestId }, () => {
    next()
  })
})

app.get("/health", (_req, res) => {
  res.json({ ok: true })
})

const port = process.env.PORT ? Number(process.env.PORT) : 3005

app.listen(port, () => {
  console.log(`prowork api listening on http://127.0.0.1:${port}`)
})

