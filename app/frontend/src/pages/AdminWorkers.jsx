import React from "react"
import { apiGet } from "../lib/api"

function safeArray(v) {
  return Array.isArray(v) ? v : []
}

export default function AdminWorkers() {
  const [status, setStatus] = React.useState("")
  const [workerType, setWorkerType] = React.useState("")
  const [state, setState] = React.useState({ loading: true, err: "", items: [] })

  function load() {
    setState((s) => ({ ...s, loading: true, err: "" }))
    const params = new URLSearchParams()
    if (status.trim()) params.set("status", status.trim())
    if (workerType.trim()) params.set("worker_type", workerType.trim())

    const url = "/api/admin/workers" + (params.toString() ? "?" + params.toString() : "")

    apiGet(url)
      .then((data) => {
        const items = safeArray(data)
        setState({ loading: false, err: "", items })
      })
      .catch((e) => {
        setState({ loading: false, err: String(e && e.message ? e.message : e), items: [] })
      })
  }

  React.useEffect(() => {
    load()
  }, [])

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#444" }}>
          Status
          <input
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="active"
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", minWidth: 160 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#444" }}>
          Worker Type
          <select
            value={workerType}
            onChange={(e) => setWorkerType(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", minWidth: 160 }}
          >
            <option value="">(any)</option>
            <option value="FTE">FTE</option>
            <option value="FREELANCER">FREELANCER</option>
          </select>
        </label>

        <button
          onClick={load}
          style={{
            padding: "9px 12px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer"
          }}
        >
          Apply
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        {state.loading ? <div>Loading...</div> : null}
        {state.err ? <div style={{ color: "#b00020" }}>{state.err}</div> : null}

        <div style={{ marginTop: 10, border: "1px solid #eee", borderRadius: 14, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={{ textAlign: "left", padding: 10, fontSize: 12, color: "#444" }}>ID</th>
                <th style={{ textAlign: "left", padding: 10, fontSize: 12, color: "#444" }}>Name</th>
                <th style={{ textAlign: "left", padding: 10, fontSize: 12, color: "#444" }}>Type</th>
                <th style={{ textAlign: "left", padding: 10, fontSize: 12, color: "#444" }}>Status</th>
                <th style={{ textAlign: "left", padding: 10, fontSize: 12, color: "#444" }}>Email</th>
              </tr>
            </thead>
            <tbody>
              {safeArray(state.items).map((w) => (
                <tr key={w.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 10, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas" }}>
                    {String(w.id || "")}
                  </td>
                  <td style={{ padding: 10, fontSize: 13 }}>{String(w.name || "")}</td>
                  <td style={{ padding: 10, fontSize: 13 }}>{String(w.worker_type || "")}</td>
                  <td style={{ padding: 10, fontSize: 13 }}>{String(w.status || "")}</td>
                  <td style={{ padding: 10, fontSize: 13 }}>{w.email === null || w.email === undefined ? "" : String(w.email)}</td>
                </tr>
              ))}
              {safeArray(state.items).length === 0 && !state.loading ? (
                <tr>
                  <td colSpan="5" style={{ padding: 12, fontSize: 13, color: "#666" }}>
                    No workers found
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
