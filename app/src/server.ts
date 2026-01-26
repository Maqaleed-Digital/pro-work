import express from "express"

const app = express()
app.use(express.json())

app.get("/health", (_req, res) => {
  res.json({ ok: true })
})

const port = process.env.PORT ? Number(process.env.PORT) : 3005

app.listen(port, () => {
  console.log(`prowork api listening on http://127.0.0.1:${port}`)
})
