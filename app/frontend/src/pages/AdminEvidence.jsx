import React from "react"
import { apiGet } from "../lib/api"

function safeArray(v) {
  return Array.isArray(v) ? v : []
}

export default function AdminEvidence() {
  const [filters, setFilters] = React.useState({
    entity_id: "",
    entity_type: "",
    action: "",
    actor: "",
    limit: "50"
  })

  const [cursor, setCursor] = React.useState("")
  const [cursorStack, setCursorStack] = React.useState([])
  const [state, setState] = React.useState({ loading: true, err: "", items: [], next_cursor: null })

  function buildUrl(cursorOverride) {
    const params = new URLSearchParams()
    Object.keys(filters).forEach((k) => {
      const v = String(filters[k] || "").trim()
      if (v) params.set(k, v)
    })
    const c = String(cursorOverride || "").trim()
    if (c) params.set("cursor", c)
    const qs = params.toString()
    return "/api/wos/evidence-events" + (qs ? "?" + qs : "")
  }

  function load(cursorOverride) {
    setState((s) => ({ ...s, loading: true, err: "" }))
    const url = buildUrl(cursorOverride)
    apiGet(url)
      .then((data) => {
        const items = safeArray(data && data.items ? data.items : [])
        const next = data && data.next_cursor ? String(data.next_cursor) : null
        setCursor(String(cursorOverride || ""))
        setState({ loading: false, err: "", items, next_cursor: next })
      })
      .catch((e) => {
        setCursor(String(cursorOverride || ""))
        setState({ loading: false, err: String(e && e.message ? e.message : e), items: [], next_cursor: null })
      })
  }

  React.useEffect(() => {
    load("")
  }, [])

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        {["entity_id", "entity_type", "action", "actor", "limit"].map((k) => (
          <label key={k} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#444" }}>
            {k}
            <input
              value={filters[k]}
              onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))}
              placeholder={k === "limit" ? "50" : ""}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", minWidth: k === "limit" ? 110 : 170 }}
            />
          </label>
        ))}

        <button
          onClick={() => {
            setCursorStack([])
            load("")
          }}
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

        <button
          onClick={() => {
            setFilters({ entity_id: "", entity_type: "", action: "", actor: "", limit: "50" })
            setCursorStack([])
            load("")
          }}
          style={{
            padding: "9px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#fff",
            color: "#111",
            cursor: "pointer"
          }}
        >
          Reset
        </button>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
        cursor: {cursor || "(none)"} · next_cursor: {state.next_cursor || "(none)"}
      </div>

      {state.loading ? <div style={{ marginTop: 10 }}>Loading...</div> : null}
      {state.err ? <div style={{ marginTop: 10, color: "#b00020" }}>{state.err}</div> : null}

      <div style={{ marginTop: 10, border: "1px solid #eee", borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ textAlign: "left", padding: 10, fontSize: 12, color: "#444" }}>Timestamp</th>
              <th style={{ textAlign: "left", padding: 10, fontSize: 12, color: "#444" }}>Action</th>
              <th style={{ textAlign: "left", padding: 10, fontSize: 12, color: "#444" }}>Actor</th>
              <th style={{ textAlign: "left", padding: 10, fontSize: 12, color: "#444" }}>Entity Type</th>
              <th style={{ textAlign: "left", padding: 10, fontSize: 12, color: "#444" }}>Entity ID</th>
              <th style={{ textAlign: "left", padding: 10, fontSize: 12, color: "#444" }}>Snapshot</th>
            </tr>
          </thead>
          <tbody>
            {safeArray(state.items).map((it) => (
              <tr key={it.id} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: 10, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas" }}>
                  {String(it.timestamp || "")}
                </td>
                <td style={{ padding: 10, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas" }}>
                  {String(it.action || "")}
                </td>
                <td style={{ padding: 10, fontSize: 13 }}>{String(it.actor || "")}</td>
                <td style={{ padding: 10, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas" }}>
                  {String(it.entity_type || "")}
                </td>
                <td style={{ padding: 10, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas" }}>
                  {String(it.entity_id || "")}
                </td>
                <td style={{ padding: 10, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas" }}>
                  {it.snapshot === null || it.snapshot === undefined ? "" : JSON.stringify(it.snapshot)}
                </td>
              </tr>
            ))}
            {safeArray(state.items).length === 0 && !state.loading ? (
              <tr>
                <td colSpan="6" style={{ padding: 12, fontSize: 13, color: "#666" }}>
                  No events found
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button
          disabled={cursorStack.length === 0}
          onClick={() => {
            if (cursorStack.length === 0) return
            const nextStack = cursorStack.slice(0, cursorStack.length - 1)
            const prevCursor = cursorStack[cursorStack.length - 1] || ""
            setCursorStack(nextStack)
            load(prevCursor)
          }}
          style={{
            padding: "9px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#fff",
            color: "#111",
            cursor: cursorStack.length === 0 ? "not-allowed" : "pointer",
            opacity: cursorStack.length === 0 ? 0.6 : 1
          }}
        >
          Prev
        </button>

        <button
          disabled={!state.next_cursor}
          onClick={() => {
            if (!state.next_cursor) return
            setCursorStack((s) => s.concat([cursor]))
            load(state.next_cursor)
          }}
          style={{
            padding: "9px 12px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: !state.next_cursor ? "not-allowed" : "pointer",
            opacity: !state.next_cursor ? 0.6 : 1
          }}
        >
          Next
        </button>
      </div>
    </div>
  )
}
