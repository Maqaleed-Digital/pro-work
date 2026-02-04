import React from "react"
import { apiGet } from "../lib/api"

export default function AdminGovernance() {
  const [state, setState] = React.useState({ loading: true, err: "", data: null })

  React.useEffect(() => {
    let alive = true
    apiGet("/api/admin/governance")
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

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 12, color: "#666" }}>Governance Snapshot</div>
      <pre style={{ margin: 0, marginTop: 10, fontSize: 12, whiteSpace: "pre-wrap" }}>
        {JSON.stringify(state.data || {}, null, 2)}
      </pre>
    </div>
  )
}
