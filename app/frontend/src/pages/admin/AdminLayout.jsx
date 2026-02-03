import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

export default function AdminLayout() {
  const loc = useLocation();
  const nav = [
    { to: "/admin", label: "Overview" },
    { to: "/admin/workers", label: "Workers" },
    { to: "/admin/evidence", label: "Evidence" },
    { to: "/admin/governance", label: "Governance" },
  ];

  return (
    <div style={styles.shell} data-testid="admin-layout">
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.brandDot} />
          <div>
            <div style={styles.brandTitle}>ProWork</div>
            <div style={styles.brandSub}>Admin</div>
          </div>
        </div>

        <nav style={styles.nav}>
          {nav.map((n) => {
            const active = loc.pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                style={{
                  ...styles.navItem,
                  ...(active ? styles.navItemActive : null),
                }}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div style={styles.footerNote}>
          Read-only surface
        </div>
      </aside>

      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

const styles = {
  shell: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "260px 1fr",
    background: "linear-gradient(180deg, rgba(2,6,23,1), rgba(15,23,42,1))",
    color: "white",
  },
  sidebar: {
    borderRight: "1px solid rgba(148,163,184,0.18)",
    padding: 16,
    background: "rgba(2,6,23,0.65)",
  },
  brand: { display: "flex", gap: 10, alignItems: "center", marginBottom: 14 },
  brandDot: {
    width: 12,
    height: 12,
    borderRadius: 99,
    background: "#22c55e",
    boxShadow: "0 0 20px rgba(34,197,94,0.35)",
  },
  brandTitle: { fontWeight: 800, letterSpacing: 0.2 },
  brandSub: { fontSize: 12, opacity: 0.7 },
  nav: { display: "flex", flexDirection: "column", gap: 8, marginTop: 12 },
  navItem: {
    textDecoration: "none",
    color: "white",
    padding: "10px 10px",
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(15,23,42,0.35)",
    fontSize: 14,
  },
  navItemActive: {
    border: "1px solid rgba(34,197,94,0.35)",
    background: "rgba(34,197,94,0.12)",
  },
  footerNote: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    fontSize: 12,
    opacity: 0.6,
  },
  main: { padding: 18 },
};
