import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext({ role: "guest", setRole: () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [role, setRole] = useState(() => localStorage.getItem("mockRole") || "admin");

  useEffect(() => {
    localStorage.setItem("mockRole", role);
  }, [role]);

  const value = useMemo(() => ({ role, setRole }), [role]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function RoleSelector() {
  const { role, setRole } = useAuth();

  return (
    <div style={styles.roleBar}>
      <span style={styles.roleLabel}>Role</span>
      <select value={role} onChange={(e) => setRole(e.target.value)} style={styles.roleSelect}>
        <option value="admin">admin</option>
        <option value="operator">operator</option>
        <option value="guest">guest</option>
      </select>
    </div>
  );
}

export function AdminGuard({ children }) {
  const { role } = useAuth();
  if (role !== "admin") return <AccessDenied currentRole={role} />;
  return children;
}

function AccessDenied({ currentRole }) {
  const { setRole } = useAuth();

  return (
    <div style={styles.page} data-testid="access-denied">
      <div style={styles.card}>
        <h1 style={styles.h1}>Access denied</h1>
        <p style={styles.p}>Admin role required.</p>
        <div style={styles.kv}>
          <div style={styles.kvRow}>
            <span style={styles.k}>Current</span>
            <span style={styles.vBad}>{currentRole}</span>
          </div>
          <div style={styles.kvRow}>
            <span style={styles.k}>Required</span>
            <span style={styles.vGood}>admin</span>
          </div>
        </div>
        <button onClick={() => setRole("admin")} style={styles.button}>
          Switch to admin (demo)
        </button>
      </div>
    </div>
  );
}

const styles = {
  roleBar: {
    position: "fixed",
    top: 12,
    right: 12,
    zIndex: 50,
    display: "flex",
    gap: 8,
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.25)",
    background: "rgba(2,6,23,0.9)",
    color: "white",
    backdropFilter: "blur(8px)",
    fontSize: 12,
  },
  roleLabel: { opacity: 0.7 },
  roleSelect: {
    background: "rgba(15,23,42,1)",
    color: "white",
    border: "1px solid rgba(148,163,184,0.25)",
    borderRadius: 8,
    padding: "6px 8px",
    fontSize: 12,
    outline: "none",
  },
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    background: "linear-gradient(180deg, rgba(2,6,23,1), rgba(15,23,42,1))",
    color: "white",
  },
  card: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    border: "1px solid rgba(148,163,184,0.25)",
    background: "rgba(2,6,23,0.6)",
    padding: 18,
  },
  h1: { margin: 0, fontSize: 22 },
  p: { marginTop: 8, opacity: 0.8 },
  kv: {
    marginTop: 14,
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.18)",
    padding: 12,
    background: "rgba(15,23,42,0.6)",
  },
  kvRow: { display: "flex", justifyContent: "space-between", marginBottom: 8 },
  k: { opacity: 0.7 },
  vBad: { color: "#f87171", fontWeight: 600 },
  vGood: { color: "#34d399", fontWeight: 600 },
  button: {
    marginTop: 14,
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.25)",
    padding: "10px 12px",
    background: "rgba(15,23,42,0.9)",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
  },
};
