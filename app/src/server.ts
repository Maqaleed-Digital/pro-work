import express from "express";
import type { Express, Request, Response } from "express";
import net from "net";
import crypto from "crypto";
import { registerAuthSessionsRoutes } from "./auth/authSessions.routes";
import { registerAuthDevLoginRoutes } from "./auth/authDevLogin.routes";
import { i18nMiddleware } from "./i18n/i18n.middleware";

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

function nowIso(): string {
  return new Date().toISOString();
}

function requestIdFrom(req: Request): string {
  const v = req.header("x-request-id");
  if (v && v.trim().length > 0) return v.trim();
  return "req_" + crypto.randomUUID();
}

function jsonError(res: Response, status: number, code: string, message: string, requestId: string) {
  return res.status(status).json({ ok: false, error: { code, message }, requestId, time: nowIso(), service: "pro-work" });
}

type LoopJob = {
  job_id: string;
  title: string;
  budget: number;
  currency: string;
  created_at: string;
  status: "open" | "accepted" | "completed" | "paid";
  accepted_application_id?: string;
};

type LoopApplication = {
  application_id: string;
  job_id: string;
  seller_id: string;
  price: number;
  created_at: string;
  status: "applied" | "accepted" | "rejected";
};

type LoopPayout = {
  payout_id: string;
  job_id: string;
  amount: number;
  currency: string;
  created_at: string;
};

type LoopState = {
  jobs: Map<string, LoopJob>;
  applications: Map<string, LoopApplication>;
  payouts: Map<string, LoopPayout>;
};

function createLoopState(): LoopState {
  return {
    jobs: new Map(),
    applications: new Map(),
    payouts: new Map()
  };
}

function parseNumber(x: any): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim().length > 0) {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

async function main() {
  const app = express();
  const loop = createLoopState();

  app.use(express.json({ limit: "1mb" }));
  app.use(i18nMiddleware);

  app.get("/health", (req, res) => {
    const requestId = requestIdFrom(req);
    res.status(200).json({ ok: true, service: "pro-work", time: nowIso(), requestId });
  });

  app.get("/api/health", (req, res) => {
    const requestId = requestIdFrom(req);
    res.status(200).json({ ok: true, service: "pro-work", time: nowIso(), requestId });
  });

  app.get("/api/i18n/ping", (req, res) => {
    const requestId = requestIdFrom(req);
    const locale = String(res.locals.locale ?? "en");
    const dir = String(res.locals.dir ?? "ltr");
    const msg = typeof res.locals.t === "function" ? res.locals.t("i18n.hello") : "Hello";
    res.status(200).json({
      ok: true,
      locale,
      dir,
      message: msg,
      requestId,
      time: nowIso(),
      service: "pro-work"
    });
  });

  app.post("/api/loop/job", (req, res) => {
    const requestId = requestIdFrom(req);
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const budget = parseNumber(req.body?.budget);
    const currency = typeof req.body?.currency === "string" && req.body.currency.trim().length > 0 ? req.body.currency.trim() : "USD";

    if (!title) return jsonError(res, 400, "invalid_request", "title is required", requestId);
    if (budget === null || budget <= 0) return jsonError(res, 400, "invalid_request", "budget must be a positive number", requestId);

    const job_id = crypto.randomUUID();
    const job: LoopJob = {
      job_id,
      title,
      budget,
      currency,
      created_at: nowIso(),
      status: "open"
    };

    loop.jobs.set(job_id, job);

    return res.status(201).json({ ok: true, job_id, job, requestId, time: nowIso(), service: "pro-work" });
  });

  app.post("/api/loop/apply", (req, res) => {
    const requestId = requestIdFrom(req);
    const job_id = typeof req.body?.job_id === "string" ? req.body.job_id.trim() : "";
    const seller_id = typeof req.body?.seller_id === "string" ? req.body.seller_id.trim() : "";
    const price = parseNumber(req.body?.price);

    if (!job_id) return jsonError(res, 400, "invalid_request", "job_id is required", requestId);
    if (!seller_id) return jsonError(res, 400, "invalid_request", "seller_id is required", requestId);
    if (price === null || price <= 0) return jsonError(res, 400, "invalid_request", "price must be a positive number", requestId);

    const job = loop.jobs.get(job_id);
    if (!job) return jsonError(res, 404, "not_found", "job not found", requestId);
    if (job.status !== "open") return jsonError(res, 409, "conflict", "job is not open for applications", requestId);

    const application_id = crypto.randomUUID();
    const appRec: LoopApplication = {
      application_id,
      job_id,
      seller_id,
      price,
      created_at: nowIso(),
      status: "applied"
    };

    loop.applications.set(application_id, appRec);

    return res.status(201).json({ ok: true, application_id, application: appRec, requestId, time: nowIso(), service: "pro-work" });
  });

  app.post("/api/loop/accept", (req, res) => {
    const requestId = requestIdFrom(req);
    const job_id = typeof req.body?.job_id === "string" ? req.body.job_id.trim() : "";
    const application_id = typeof req.body?.application_id === "string" ? req.body.application_id.trim() : "";

    if (!job_id) return jsonError(res, 400, "invalid_request", "job_id is required", requestId);
    if (!application_id) return jsonError(res, 400, "invalid_request", "application_id is required", requestId);

    const job = loop.jobs.get(job_id);
    if (!job) return jsonError(res, 404, "not_found", "job not found", requestId);
    if (job.status !== "open") return jsonError(res, 409, "conflict", "job is not open", requestId);

    const appRec = loop.applications.get(application_id);
    if (!appRec) return jsonError(res, 404, "not_found", "application not found", requestId);
    if (appRec.job_id !== job_id) return jsonError(res, 409, "conflict", "application does not belong to job", requestId);
    if (appRec.status !== "applied") return jsonError(res, 409, "conflict", "application is not in applied status", requestId);

    for (const a of loop.applications.values()) {
      if (a.job_id === job_id && a.application_id !== application_id && a.status === "applied") {
        a.status = "rejected";
        loop.applications.set(a.application_id, a);
      }
    }

    appRec.status = "accepted";
    loop.applications.set(application_id, appRec);

    job.status = "accepted";
    job.accepted_application_id = application_id;
    loop.jobs.set(job_id, job);

    return res.status(200).json({ ok: true, job_id, application_id, job, application: appRec, requestId, time: nowIso(), service: "pro-work" });
  });

  app.post("/api/loop/complete", (req, res) => {
    const requestId = requestIdFrom(req);
    const job_id = typeof req.body?.job_id === "string" ? req.body.job_id.trim() : "";

    if (!job_id) return jsonError(res, 400, "invalid_request", "job_id is required", requestId);

    const job = loop.jobs.get(job_id);
    if (!job) return jsonError(res, 404, "not_found", "job not found", requestId);
    if (job.status !== "accepted") return jsonError(res, 409, "conflict", "job must be accepted before completion", requestId);

    job.status = "completed";
    loop.jobs.set(job_id, job);

    return res.status(200).json({ ok: true, job_id, job, requestId, time: nowIso(), service: "pro-work" });
  });

  app.post("/api/loop/payout", (req, res) => {
    const requestId = requestIdFrom(req);
    const job_id = typeof req.body?.job_id === "string" ? req.body.job_id.trim() : "";
    const amount = parseNumber(req.body?.amount);
    const currency = typeof req.body?.currency === "string" && req.body.currency.trim().length > 0 ? req.body.currency.trim() : "USD";

    if (!job_id) return jsonError(res, 400, "invalid_request", "job_id is required", requestId);
    if (amount === null || amount <= 0) return jsonError(res, 400, "invalid_request", "amount must be a positive number", requestId);

    const job = loop.jobs.get(job_id);
    if (!job) return jsonError(res, 404, "not_found", "job not found", requestId);
    if (job.status !== "completed") return jsonError(res, 409, "conflict", "job must be completed before payout", requestId);

    const payout_id = crypto.randomUUID();
    const payout: LoopPayout = {
      payout_id,
      job_id,
      amount,
      currency,
      created_at: nowIso()
    };

    loop.payouts.set(payout_id, payout);

    job.status = "paid";
    loop.jobs.set(job_id, job);

    return res.status(201).json({ ok: true, payout_id, payout, job, requestId, time: nowIso(), service: "pro-work" });
  });

  const podsRoutes = await import("./pods/pods.routes");
  const podRoleAssignmentsRoutes = await import("./pods/podRoleAssignments.routes");
  const workspacesRoutes = await import("./workspaces/workspaces.routes");
  const workspacePodsRoutes = await import("./workspaces/workspacePods.routes");

  tryRegisterRoutes(app, podsRoutes, "pods.routes");
  tryRegisterRoutes(app, podRoleAssignmentsRoutes, "podRoleAssignments.routes");
  tryRegisterRoutes(app, workspacesRoutes, "workspaces.routes");
  tryRegisterRoutes(app, workspacePodsRoutes, "workspacePods.routes");

  registerAuthSessionsRoutes(app);
  registerAuthDevLoginRoutes(app);

  const port = await pickPort();

  app.listen(port, "127.0.0.1", () => {
    console.log("prowork-app listening on http://127.0.0.1:" + port);
    console.log("health: curl -sS http://127.0.0.1:" + port + "/health");
    console.log("api health: curl -sS http://127.0.0.1:" + port + "/api/health");
    console.log("i18n ping: curl -sS http://127.0.0.1:" + port + "/api/i18n/ping");
  });
}

main().catch((e) => {
  console.error("server failed to start", e);
  process.exit(1);
});
