import React, { useEffect, useMemo, useState } from "react";
import { toArray } from "../../utils/helpers";

const API = import.meta.env.VITE_BACKEND_URL || "";

export default function AdminWorkers() {
  const [workers, setWorkers] = useState([]);
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (type) qs.set("worker_type", type);

      const r = await fetch(`${API}/api/admin/workers?${qs.toString()}`, {
        headers: { "X-Role": "admin" },
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error?.message || "workers failed");
      setWorkers(toArray(j.data));
    } catch (e) {
      setWorkers([]);
      setErr(e?.message || "Failed to load workers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [status, type]);

  const rows = useMemo(() => toArray(workers), [workers]);

  return (
    <div data-testid="admin-workers">
      <Header title="Workers" subtitle="Read-only directory" onRefresh={load} loading={loading} />
      {err ? <ErrorBox text={err} /> : null}

      <div style={s.filters}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={s.select}>
          <option value="">All statuses</option>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="suspended">suspended</option>
        </select>

        <select value={type} onChange={(e) => setType(e.target.value)} style={s.select}>
          <option value="">All types</option>
          <option value="FTE">FTE</option>
          <option value="FREELANCER">FREELANCER</option>
        </select>
      </div>

      <div style={s.card}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Worker</th>
              <th style={s.th}>Email</th>
              <th style={s.th}>Type</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Pod</th>
              <th style={s.th}>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((w) => (
                <tr key={w.id} style={s.tr}>
                  <td style={s.tdMono}>{String(w.id || "").slice(0, 8)}…</td>
                  <td style={s.td}>{w.email || "—"}</td>
                  <td style={s.td}>{w.worker_type || "—"}</td>
                  <td style={s.td}>{w.status || "—"}</td>
                  <td style={s.td}>{w.assigned_pod?.name || "—"}</td>
                  <td style={s.td}>{w.created_at ? new Date(w.created_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td style={s.empty} colSpan={6}>
                  {loading ? "Loading…" : "No workers found"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
  filters: { display: "flex", gap: 10, marginBottom: 12 },
  select: {
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(148,163,184,0.2)",
    background: "rgba(2,6,23,0.55)",
    color: "white",
    outline: "none",
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
};
