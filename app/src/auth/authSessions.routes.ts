import type { Express, Request, Response } from "express";
import { addDays, generateOpaqueRefreshToken, nowUtc } from "../lib/auth/tokens";
import {
  createSession,
  findActiveSessionByRefreshToken,
  listUserSessions,
  revokeAllUserSessions,
  revokeSession,
  touchSession,
} from "../lib/auth/sessionStore";

type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  path?: string;
  maxAgeSeconds?: number;
};

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  const parts = cookieHeader.split(";");
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function serializeCookie(name: string, value: string, opts: CookieOptions): string {
  const enc = encodeURIComponent(value);
  const chunks: string[] = [];
  chunks.push(`${name}=${enc}`);

  if (opts.path) chunks.push(`Path=${opts.path}`);
  if (opts.httpOnly) chunks.push("HttpOnly");
  if (opts.secure) chunks.push("Secure");
  if (opts.sameSite) chunks.push(`SameSite=${opts.sameSite[0].toUpperCase()}${opts.sameSite.slice(1)}`);
  if (typeof opts.maxAgeSeconds === "number") chunks.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAgeSeconds))}`);

  return chunks.join("; ");
}

function setCookie(res: Response, cookie: string) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookie]);
    return;
  }
  res.setHeader("Set-Cookie", [String(existing), cookie]);
}

function getRefreshFromRequest(req: Request): string | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  const c = cookies["prowork_refresh"];
  if (typeof c === "string" && c.length > 0) return c;

  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();

  return null;
}

function getIp(req: Request): string | null {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0]?.trim() ?? null;
  if (Array.isArray(xf) && xf.length > 0) return xf[0]?.split(",")[0]?.trim() ?? null;
  return (req.ip as string | undefined) ?? null;
}

function getUserAgent(req: Request): string | null {
  const ua = req.headers["user-agent"];
  if (typeof ua === "string") return ua;
  return null;
}

export function registerAuthSessionsRoutes(app: Express) {
  app.post("/api/auth/refresh", async (req: Request, res: Response) => {
    const refreshToken = getRefreshFromRequest(req);
    if (!refreshToken) return res.status(400).json({ ok: false, error: "missing_refresh_token" });

    const session = await findActiveSessionByRefreshToken(refreshToken);
    if (!session) return res.status(401).json({ ok: false, error: "invalid_or_expired_refresh" });

    await touchSession(session.id);

    const newRefresh = generateOpaqueRefreshToken();
    const refreshExpiresAt = addDays(nowUtc(), 30);

    const rotated = await createSession({
      userId: session.user_id,
      refreshTokenPlain: newRefresh,
      expiresAt: refreshExpiresAt,
      userAgent: getUserAgent(req),
      ip: getIp(req),
      rotatedFromSessionId: session.id,
    });

    await revokeSession(session.id, "rotated");

    setCookie(
      res,
      serializeCookie("prowork_refresh", newRefresh, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAgeSeconds: 60 * 60 * 24 * 30,
      })
    );

    return res.status(200).json({
      ok: true,
      session_id: rotated.id,
      refresh_token: newRefresh,
      refresh_expires_at: rotated.expires_at,
    });
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const refreshToken = getRefreshFromRequest(req);

    if (refreshToken) {
      const session = await findActiveSessionByRefreshToken(refreshToken);
      if (session) await revokeSession(session.id, "logout");
    }

    setCookie(
      res,
      serializeCookie("prowork_refresh", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAgeSeconds: 0,
      })
    );

    return res.status(200).json({ ok: true });
  });

  app.get("/api/auth/sessions", async (req: Request, res: Response) => {
    const refreshToken = getRefreshFromRequest(req);
    if (!refreshToken) return res.status(401).json({ ok: false, error: "missing_refresh_token" });

    const session = await findActiveSessionByRefreshToken(refreshToken);
    if (!session) return res.status(401).json({ ok: false, error: "invalid_or_expired_refresh" });

    const rows = await listUserSessions(session.user_id);

    return res.status(200).json({
      ok: true,
      sessions: rows.map((s) => ({
        id: s.id,
        created_at: s.created_at,
        last_seen_at: s.last_seen_at,
        expires_at: s.expires_at,
        revoked_at: s.revoked_at,
        revoke_reason: s.revoke_reason,
        user_agent: s.user_agent,
        ip: s.ip,
        rotated_from_session_id: s.rotated_from_session_id,
      })),
    });
  });

  app.post("/api/auth/revoke", async (req: Request, res: Response) => {
    const refreshToken = getRefreshFromRequest(req);
    if (!refreshToken) return res.status(401).json({ ok: false, error: "missing_refresh_token" });

    const current = await findActiveSessionByRefreshToken(refreshToken);
    if (!current) return res.status(401).json({ ok: false, error: "invalid_or_expired_refresh" });

    const sessionId = (req.body?.session_id as string | undefined) ?? "";
    if (!sessionId) return res.status(400).json({ ok: false, error: "missing_session_id" });

    await revokeSession(sessionId, "user_revoked");
    return res.status(200).json({ ok: true });
  });

  app.post("/api/auth/revoke-all", async (req: Request, res: Response) => {
    const refreshToken = getRefreshFromRequest(req);
    if (!refreshToken) return res.status(401).json({ ok: false, error: "missing_refresh_token" });

    const current = await findActiveSessionByRefreshToken(refreshToken);
    if (!current) return res.status(401).json({ ok: false, error: "invalid_or_expired_refresh" });

    await revokeAllUserSessions(current.user_id, "user_revoked_all");

    setCookie(
      res,
      serializeCookie("prowork_refresh", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAgeSeconds: 0,
      })
    );

    return res.status(200).json({ ok: true });
  });
}
