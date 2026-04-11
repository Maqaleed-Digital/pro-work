import { ReactNode } from "react";
import { Navigation } from "./Navigation";

type AppShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function AppShell({ title, subtitle, children }: AppShellProps) {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a" }}>
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", minHeight: "100vh" }}>
        <aside style={{ borderRight: "1px solid #e2e8f0", padding: "24px", background: "#ffffff" }}>
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "20px", fontWeight: 800 }}>WorkCaptain</div>
            <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px" }}>
              Governed Execution Runtime
            </div>
          </div>
          <Navigation />
        </aside>
        <main style={{ padding: "32px" }}>
          <header style={{ marginBottom: "24px" }}>
            <h1 style={{ margin: 0, fontSize: "28px" }}>{title}</h1>
            <p style={{ marginTop: "8px", color: "#475569" }}>{subtitle}</p>
          </header>
          <section>{children}</section>
        </main>
      </div>
    </div>
  );
}
