import React from "react"
import { NavLink, Route, Routes, Navigate } from "react-router-dom"
import { apiRole, setRole } from "./lib/api"
import AdminOverview from "./pages/AdminOverview"
import AdminGovernance from "./pages/AdminGovernance"
import AdminWorkers from "./pages/AdminWorkers"
import AdminEvidence from "./pages/AdminEvidence"

function Layout({ children }) {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial", padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>ProWork Admin</div>
          <div style={{ fontSize: 12, color: "#666" }}>Vite UI talking to backend via proxy</div>
        </div>
        <RolePicker />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14, borderBottom: "1px solid #eee", paddingBottom: 10 }}>
        <Tab to="/admin/overview" label="Overview" />
        <Tab to="/admin/workers" label="Workers" />
        <Tab to="/admin/evidence" label="Evidence" />
        <Tab to="/admin/governance" label="Governance" />
      </div>

      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  )
}

function Tab({ to, label }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        textDecoration: "none",
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid #ddd",
        color: "#111",
        background: isActive ? "#f3f3f3" : "#fff",
        fontSize: 13
      })}
    >
      {label}
    </NavLink>
  )
}

function RolePicker() {
  const [role, setLocalRole] = React.useState(apiRole())

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <div style={{ fontSize: 12, color: "#444" }}>X-Role</div>
      <select
        value={role}
        onChange={(e) => {
          const v = setRole(e.target.value)
          setLocalRole(v)
          window.location.reload()
        }}
        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", fontSize: 13 }}
      >
        <option value="admin">admin</option>
        <option value="guest">guest</option>
      </select>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/overview" replace />} />

      <Route
        path="/admin/*"
        element={
          <Layout>
            <Routes>
              <Route path="overview" element={<AdminOverview />} />
              <Route path="workers" element={<AdminWorkers />} />
              <Route path="evidence" element={<AdminEvidence />} />
              <Route path="governance" element={<AdminGovernance />} />
              <Route path="*" element={<Navigate to="/admin/overview" replace />} />
            </Routes>
          </Layout>
        }
      />

      <Route path="*" element={<Navigate to="/admin/overview" replace />} />
    </Routes>
  )
}
