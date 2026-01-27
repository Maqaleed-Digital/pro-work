import type { Express, Request, Response } from "express";
import { addDays, generateOpaqueRefreshToken, nowUtc } from "../lib/auth/tokens";
import { createSession, findActiveSessionByRefreshToken } from "../lib/auth/sessionStore";

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

function isEnabled(): boolean {
  return String(process.env.PROWORK_DEV_AUTH ?? "").toLowerCase() === "true";
}

// DEV endpoint accepts any canonical UUID shape (not enforcing RFC version/variant bits)
function isUuidLoose(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function registerAuthDevLoginRoutes(app: Express) {
  // DEV ONLY: create initial session for a user_id and set refresh cookie
  app.post("/api/auth/dev/login", async (req: Request, res: Response) => {
    if (!isEnabled()) return res.status(404).json({ ok: false, error: "not_found" });

    const userId = String(req.body?.user_id ?? "").trim();
    if (!userId) return res.status(400).json({ ok: false, error: "missing_user_id" });
    if (!isUuidLoose(userId)) return res.status(400).json({ ok: false, error: "invalid_user_id" });

    const newRefresh = generateOpaqueRefreshToken();
    const refreshExpiresAt = addDays(nowUtc(), 30);

    const created = await createSession({
      userId,
      refreshTokenPlain: newRefresh,
      expiresAt: refreshExpiresAt,
      userAgent: getUserAgent(req),
      ip: getIp(req),
      rotatedFromSessionId: null,
    });

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
      user_id: userId,
      session_id: created.id,
      refresh_token: newRefresh,
      refresh_expires_at: created.expires_at,
    });
  });

  // DEV ONLY: verify current identity by refresh token
  app.get("/api/auth/whoami", async (req: Request, res: Response) => {
    if (!isEnabled()) return res.status(404).json({ ok: false, error: "not_found" });

    const refreshToken = getRefreshFromRequest(req);
    if (!refreshToken) return res.status(401).json({ ok: false, error: "missing_refresh_token" });

    const session = await findActiveSessionByRefreshToken(refreshToken);
    if (!session) return res.status(401).json({ ok: false, error: "invalid_or_expired_refresh" });

    return res.status(200).json({
      ok: true,
      user_id: session.user_id,
      session_id: session.id,
      expires_at: session.expires_at,
    });
  });
}
