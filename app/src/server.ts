import express from "express";
import type { Express } from "express";
import net from "net";
import { registerAuthSessionsRoutes } from "./auth/authSessions.routes";
import { registerAuthDevLoginRoutes } from "./auth/authDevLogin.routes";

type RouteModule = Record<string, any>;

function isExpressRouter(x: any): boolean {
  return !!x && typeof x === "function" && typeof x.use === "function" && typeof x.handle === "function";
}

function tryRegisterRoutes(app: Express, mod: RouteModule, label: string) {
  if (!mod) return;

  const candidates: any[] = [];

  if (typeof mod.default !== "undefined") candidates.push(mod.default);
  for (const k of Object.keys(mod)) candidates.push(mod[k]);

  for (const c of candidates) {
    if (typeof c === "function") {
      try {
        if (isExpressRouter(c)) {
          app.use(c);
          return;
        }
        if (c.length >= 1) {
          c(app);
          return;
        }
      } catch (e) {
        console.error("route registration failed for", label, "via candidate", e);
      }
    } else if (isExpressRouter(c)) {
      app.use(c);
      return;
    }
  }

  console.warn("no recognizable routes exported from", label);
}

function canListen(port: number, host: string = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, host);
  });
}

async function pickPort(): Promise<number> {
  const envPort = process.env.PORT;
  if (envPort) {
    const p = Number(envPort);
    if (!Number.isFinite(p) || p <= 0) throw new Error("Invalid PORT: " + envPort);
    return p;
  }

  const preferred = [3010, 3011, 3012, 3013, 3014, 3015, 3020, 3021, 3022, 3030, 3031, 3032, 8080];

  for (const p of preferred) {
    if (await canListen(p)) return p;
  }

  for (let p = 3040; p <= 3099; p++) {
    if (await canListen(p)) return p;
  }

  for (let p = 8000; p <= 8999; p++) {
    if (await canListen(p)) return p;
  }

  throw new Error("No available port found in preferred/fallback ranges");
}

async function main() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

  // Existing route modules
  const podsRoutes = await import("./pods/pods.routes");
  const podRoleAssignmentsRoutes = await import("./pods/podRoleAssignments.routes");
  const workspacesRoutes = await import("./workspaces/workspaces.routes");
  const workspacePodsRoutes = await import("./workspaces/workspacePods.routes");

  tryRegisterRoutes(app, podsRoutes, "pods.routes");
  tryRegisterRoutes(app, podRoleAssignmentsRoutes, "podRoleAssignments.routes");
  tryRegisterRoutes(app, workspacesRoutes, "workspaces.routes");
  tryRegisterRoutes(app, workspacePodsRoutes, "workspacePods.routes");

  // Sprint S4 auth session routes
  registerAuthSessionsRoutes(app);

  // Sprint S3 bootstrap (DEV ONLY, gated by PROWORK_DEV_AUTH=true)
  registerAuthDevLoginRoutes(app);

  const port = await pickPort();

  app.listen(port, "127.0.0.1", () => {
    console.log("prowork-app listening on http://127.0.0.1:" + port);
    console.log("health: curl -sS http://127.0.0.1:" + port + "/health");
  });
}

main().catch((e) => {
  console.error("server failed to start", e);
  process.exit(1);
});
