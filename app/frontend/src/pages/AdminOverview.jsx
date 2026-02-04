import React from "react"
import { apiGet } from "../lib/api"

function Card({ title, children }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 12, color: "#666" }}>{title}</div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  )
}

export default function AdminOverview() {
  const [state, setState] = React.useState({ loading: true, err: "", data: null })

  React.useEffect(() => {
    let alive = true
    apiGet("/api/admin/stats")
      .then((data) => {
        if (!alive) return
        setState({ loading: false, err: "", data })
      })
      .catch((e) => {
        if (!alive) return
        setState({ loading: false, err: String(e && e.message ? e.message : e), data: null })
      })
    return () => {
      alive = false
    }
  }, [])

  if (state.loading) return <div>Loading...</div>
  if (state.err) return <div style={{ color: "#b00020" }}>{state.err}</div>

  const d = state.data || {}
  const workers = d.workers || { total: 0, fte: 0, freelancer: 0 }
  const evidence = d.evidence || { total: 0, recent: [] }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
      <Card title="Workers">
        <div style={{ fontSize: 24, fontWeight: 800 }}>{workers.total || 0}</div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          FTE: {workers.fte || 0} · Freelancers: {workers.freelancer || 0}
        </div>
      </Card>

      <Card title="Evidence Events">
        <div style={{ fontSize: 24, fontWeight: 800 }}>{evidence.total || 0}</div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Recent sample stored in-memory</div>
      </Card>

      <Card title="Recent Evidence (top 10)">
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(evidence.recent || [], null, 2)}
        </pre>
      </Card>

      <Card title="Raw Stats JSON">
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>{JSON.stringify(d, null, 2)}</pre>
      </Card>
    </div>
  )
}
