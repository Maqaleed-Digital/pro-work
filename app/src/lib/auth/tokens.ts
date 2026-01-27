import crypto from "crypto";

export type RefreshTokenPlain = string;
export type RefreshTokenHash = string;

export function generateOpaqueRefreshToken(bytes: number = 48): RefreshTokenPlain {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashRefreshToken(token: RefreshTokenPlain): RefreshTokenHash {
  const h = crypto.createHash("sha256");
  h.update(token, "utf8");
  return h.digest("hex");
}

export function nowUtc(): Date {
  return new Date();
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
