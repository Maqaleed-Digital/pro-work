import React, { useEffect, useMemo, useState } from "react";
import { toArray } from "../../utils/helpers";

const API = import.meta.env.VITE_BACKEND_URL || "";

export default function AdminEvidence() {
  const [events, setEvents] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ entity_type: "", action: "", actor: "", limit: 20 });
  const [cursor, setCursor] = useState("");

  async function load(nextCursor = "") {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams();
      if (filters.entity_type) qs.set("entity_type", filters.entity_type);
      if (filters.action) qs.set("action", filters.action);
      if (filters.actor) qs.set("actor", filters.actor);
      qs.set("limit", String(filters.limit || 20));
      if (nextCursor) qs.set("cursor", nextCursor);

      const r = await fetch(`${API}/api/wos/evidence-events?${qs.toString()}`, {
        headers: { "X-Role": "admin" },
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error?.message || "evidence failed");
      setEvents(toArray(j.data));
      setCursor(j?.data?.next_cursor || "");
    } catch (e) {
      setEvents([]);
      setCursor("");
      setErr(e?.message || "Failed to load evidence");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("");
  }, [filters.entity_type, filters.action, filters.actor, filters.limit]);

  const rows = useMemo(() => toArray(events), [events]);

  return (
    <div data-testid="admin-evidence">
      <Header title="Evidence" subtitle="Audit trail events" onRefresh={() => load("")} loading={loading} />
      {err ? <ErrorBox text={err} /> : null}

      <div style={s.filters}>
        <select
          value={filters.entity_type}
          onChange={(e) => setFilters((x) => ({ ...x, entity_type: e.target.value }))}
          style={s.select}
        >
          <option value="">All entities</option>
          <option value="worker">worker</option>
          <option value="pod">pod</option>
        </select>

        <input
          value={filters.action}
          onChange={(e) => setFilters((x) => ({ ...x, action: e.target.value }))}
          placeholder="action contains…"
          style={s.input}
        />

        <input
          value={filters.actor}
          onChange={(e) => setFilters((x) => ({ ...x, actor: e.target.value }))}
          placeholder="actor contains…"
          style={s.input}
        />

        <select
          value={String(filters.limit)}
          onChange={(e) => setFilters((x) => ({ ...x, limit: parseInt(e.target.value, 10) }))}
          style={s.select}
        >
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
        </select>
      </div>

      <div style={s.card}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Evidence</th>
              <th style={s.th}>Action</th>
              <th style={s.th}>Entity</th>
              <th style={s.th}>Actor</th>
              <th style={s.th}>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((ev) => (
                <tr key={ev.id} style={s.tr}>
                  <td style={s.tdMono}>{String(ev.id || "").slice(0, 8)}…</td>
                  <td style={s.td}>{ev.action || ev.event_type || "—"}</td>
                  <td style={s.td}>{ev.entity_type}:{String(ev.entity_id || "").slice(0, 8)}…</td>
                  <td style={s.td}>{ev.actor || "—"}</td>
                  <td style={s.td}>{ev.timestamp ? new Date(ev.timestamp).toLocaleString() : "—"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td style={s.empty} colSpan={5}>
                  {loading ? "Loading…" : "No evidence found"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={s.pager}>
        <div style={{ opacity: 0.7, fontSize: 12 }}>Showing {rows.length}</div>
        <button onClick={() => cursor && load(cursor)} disabled={!cursor || loading} style={s.btnSmall}>
          Next
        </button>
      </div>
    </div>
  );
}

function Header({ title, subtitle, onRefresh, loading }) {
  return (
    <div style={s.header}>
      <div>
        <div style={s.h1}>{title}</div>
        <div style={s.sub}>{subtitle}</div>
      </div>
      <button onClick={onRefresh} disabled={loading} style={s.btn}>
        {loading ? "Loading…" : "Refresh"}
      </button>
    </div>
  );
}

function ErrorBox({ text }) {
  return <div style={s.err}>{text}</div>;
}

const s = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 },
  h1: { fontSize: 22, fontWeight: 900 },
  sub: { fontSize: 12, opacity: 0.7, marginTop: 3 },
  btn: {
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(148,163,184,0.25)",
    background: "rgba(15,23,42,0.65)",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },
  btnSmall: {
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(148,163,184,0.25)",
    background: "rgba(15,23,42,0.65)",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
    minWidth: 90,
  },
  err: {
    marginTop: 10,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(248,113,113,0.35)",
    background: "rgba(248,113,113,0.12)",
    color: "white",
    fontSize: 13,
  },
  filters: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  select: {
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(148,163,184,0.2)",
    background: "rgba(2,6,23,0.55)",
    color: "white",
    outline: "none",
  },
  input: {
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(148,163,184,0.2)",
    background: "rgba(2,6,23,0.55)",
    color: "white",
    outline: "none",
    minWidth: 180,
  },
  card: {
    borderRadius: 16,
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(2,6,23,0.55)",
    overflow: "hidden",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: 12, opacity: 0.7, borderBottom: "1px solid rgba(148,163,184,0.12)" },
  tr: { borderBottom: "1px solid rgba(148,163,184,0.08)" },
  td: { padding: 12, opacity: 0.9 },
  tdMono: { padding: 12, fontFamily: "ui-monospace", opacity: 0.85 },
  empty: { padding: 18, textAlign: "center", opacity: 0.7 },
  pager: { marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" },
};
