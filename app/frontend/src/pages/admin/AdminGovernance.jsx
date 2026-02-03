import React, { useEffect, useMemo, useState } from "react";
import { toArray } from "../../utils/helpers";

const API = import.meta.env.VITE_BACKEND_URL || "";

export default function AdminGovernance() {
  const [gov, setGov] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`${API}/api/admin/governance`, { headers: { "X-Role": "admin" } });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error?.message || "governance failed");
      setGov(j.data || null);
    } catch (e) {
      setGov(null);
      setErr(e?.message || "Failed to load governance");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const checks = useMemo(() => toArray(gov?.checks), [gov]);
  const notes = useMemo(() => toArray(gov?.notes), [gov]);

  return (
    <div data-testid="admin-governance">
      <Header title="Governance" subtitle="System compliance and health" onRefresh={load} loading={loading} />
      {err ? <ErrorBox text={err} /> : null}

      <div style={s.grid2}>
        <Card title="Last Doctor Run">
          <div style={s.kvRow}>
            <span style={s.k}>status</span>
            <span style={pill(gov?.last_doctor_run?.status)}>{gov?.last_doctor_run?.status || "unknown"}</span>
          </div>
          <div style={s.small}>
            {gov?.last_doctor_run?.timestamp ? new Date(gov.last_doctor_run.timestamp).toLocaleString() : ""}
          </div>
          <div style={s.small}>
            passed {gov?.last_doctor_run?.passed || 0} of {gov?.last_doctor_run?.total || 0}
          </div>
        </Card>

        <Card title="CI Status">
          <div style={s.kvRow}>
            <span style={s.k}>status</span>
            <span style={pill(gov?.ci_status?.status)}>{gov?.ci_status?.status || "unknown"}</span>
          </div>
          <div style={s.small}>branch {gov?.ci_status?.branch || "—"}</div>
          <div style={s.small}>
            last {gov?.ci_status?.last_run ? new Date(gov.ci_status.last_run).toLocaleString() : ""}
          </div>
          <div style={{ ...s.small, opacity: 0.75, marginTop: 8 }}>{gov?.ci_status?.note || ""}</div>
        </Card>
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}>Required Checks</div>
        {checks.length ? (
          <div style={s.checkGrid}>
            {checks.map((c) => (
              <div key={c.name} style={s.checkItem}>
                <span style={pill(c.status)}>{c.status}</span>
                <div style={{ fontWeight: 700 }}>{String(c.name || "").replaceAll("_", " ")}</div>
                <div style={s.small}>{c.message || ""}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ opacity: 0.7, marginTop: 10 }}>No checks reported</div>
        )}
      </div>

      <div style={s.card}>
        <div style={s.cardTitle}>Notes</div>
        {notes.length ? (
          <ul style={{ marginTop: 10 }}>
            {notes.map((n, i) => (
              <li key={i} style={{ opacity: 0.85, marginBottom: 6 }}>{n}</li>
            ))}
          </ul>
        ) : (
          <div style={{ opacity: 0.7, marginTop: 10 }}>No notes</div>
        )}
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

function Card({ title, children }) {
  return (
    <div style={s.card}>
      <div style={s.cardTitle}>{title}</div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function pill(status) {
  const s = String(status || "").toLowerCase();
  const good = s === "pass" || s === "success";
  return {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: `1px solid ${good ? "rgba(34,197,94,0.35)" : "rgba(248,113,113,0.35)"}`,
    background: good ? "rgba(34,197,94,0.12)" : "rgba(248,113,113,0.12)",
  };
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
  grid2: { display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  card: {
    marginTop: 12,
    borderRadius: 16,
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(2,6,23,0.55)",
    padding: 14,
  },
  cardTitle: { fontWeight: 900 },
  kvRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  k: { opacity: 0.7, fontSize: 12 },
  small: { opacity: 0.7, fontSize: 12, marginTop: 6 },
  checkGrid: { display: "grid", gap: 10, gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: 10 },
  checkItem: {
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.12)",
    background: "rgba(15,23,42,0.35)",
    padding: 12,
    display: "grid",
    gap: 6,
  },
};
