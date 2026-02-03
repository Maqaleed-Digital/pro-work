import React, { useEffect, useState } from "react";
import { toArray } from "../../utils/helpers";

const API = import.meta.env.VITE_BACKEND_URL || "";

export default function AdminOverview() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`${API}/api/admin/stats`, { headers: { "X-Role": "admin" } });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error?.message || "stats failed");
      setStats(j.data || null);
    } catch (e) {
      setErr(e?.message || "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const recent = toArray(stats?.evidence?.recent);

  return (
    <div data-testid="admin-overview">
      <Header title="Overview" subtitle="Situational awareness" onRefresh={load} loading={loading} />

      {err ? <ErrorBox text={err} /> : null}

      <div style={gridStyles.grid}>
        <StatCard label="Workers" value={stats?.workers?.total || 0} />
        <StatCard label="Pods" value={stats?.pods?.total || 0} />
        <StatCard label="Evidence Events" value={stats?.evidence?.total || 0} />
        <StatCard label="Governance" value={(stats?.governance?.status || "unknown").toUpperCase()} />
      </div>

      <div style={gridStyles.card}>
        <div style={gridStyles.cardTitle}>Recent Evidence</div>
        {recent.length ? (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {recent.slice(0, 10).map((ev) => (
              <div key={ev.id} style={gridStyles.row}>
                <div style={{ fontFamily: "ui-monospace", fontSize: 12, opacity: 0.85 }}>
                  {ev.action || ev.event_type}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>
                  {ev.entity_type}:{String(ev.entity_id || "").slice(0, 8)}…
                </div>
                <div style={{ opacity: 0.6, fontSize: 12 }}>
                  {ev.actor} · {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : ""}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 10, opacity: 0.7 }}>No evidence yet</div>
        )}
      </div>
    </div>
  );
}

function Header({ title, subtitle, onRefresh, loading }) {
  return (
    <div style={gridStyles.header}>
      <div>
        <div style={gridStyles.h1}>{title}</div>
        <div style={gridStyles.sub}>{subtitle}</div>
      </div>
      <button onClick={onRefresh} disabled={loading} style={gridStyles.btn}>
        {loading ? "Loading…" : "Refresh"}
      </button>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={gridStyles.stat}>
      <div style={{ opacity: 0.75, fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function ErrorBox({ text }) {
  return (
    <div style={gridStyles.err}>
      {text}
    </div>
  );
}

const gridStyles = {
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
  grid: { display: "grid", gap: 12, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" },
  stat: {
    borderRadius: 16,
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(2,6,23,0.55)",
    padding: 14,
  },
  card: {
    marginTop: 14,
    borderRadius: 16,
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(2,6,23,0.55)",
    padding: 14,
  },
  cardTitle: { fontWeight: 800 },
  row: {
    display: "grid",
    gridTemplateColumns: "180px 1fr 280px",
    gap: 10,
    alignItems: "center",
    padding: "10px 10px",
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.12)",
    background: "rgba(15,23,42,0.35)",
  },
};
