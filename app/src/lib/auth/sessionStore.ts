import { hashRefreshToken } from "./tokens";

export type SessionRow = {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  rotated_from_session_id: string | null;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
};

type DbClient = {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
};

export function getDbClient(): DbClient {
  const pg = require("pg") as typeof import("pg");
  const DB_URL = process.env.DB_URL;
  if (!DB_URL) throw new Error("Missing DB_URL env var (postgres connection string)");
  const pool = (global as any).__prowork_pg_pool ?? new pg.Pool({ connectionString: DB_URL });
  (global as any).__prowork_pg_pool = pool;
  return {
    query: (sql: string, params?: any[]) => pool.query(sql, params),
  };
}

export async function createSession(args: {
  userId: string;
  refreshTokenPlain: string;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
  rotatedFromSessionId?: string | null;
}): Promise<SessionRow> {
  const db = getDbClient();
  const refreshHash = hashRefreshToken(args.refreshTokenPlain);

  const res = await db.query(
    `
    insert into prowork.sessions
      (user_id, refresh_token_hash, expires_at, user_agent, ip, rotated_from_session_id)
    values
      ($1, $2, $3, $4, $5, $6)
    returning *
    `,
    [
      args.userId,
      refreshHash,
      args.expiresAt.toISOString(),
      args.userAgent,
      args.ip,
      args.rotatedFromSessionId ?? null,
    ]
  );

  return res.rows[0] as SessionRow;
}

export async function findActiveSessionByRefreshToken(refreshTokenPlain: string): Promise<SessionRow | null> {
  const db = getDbClient();
  const refreshHash = hashRefreshToken(refreshTokenPlain);

  const res = await db.query(
    `
    select *
    from prowork.sessions
    where refresh_token_hash = $1
      and revoked_at is null
      and expires_at > now()
    limit 1
    `,
    [refreshHash]
  );

  return (res.rows[0] as SessionRow) ?? null;
}

export async function touchSession(sessionId: string): Promise<void> {
  const db = getDbClient();
  await db.query(`select prowork.touch_session($1)`, [sessionId]);
}

export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  const db = getDbClient();
  await db.query(
    `
    update prowork.sessions
    set revoked_at = now(), revoke_reason = $2
    where id = $1 and revoked_at is null
    `,
    [sessionId, reason]
  );
}

export async function revokeAllUserSessions(userId: string, reason: string): Promise<void> {
  const db = getDbClient();
  await db.query(
    `
    update prowork.sessions
    set revoked_at = now(), revoke_reason = $2
    where user_id = $1 and revoked_at is null
    `,
    [userId, reason]
  );
}

export async function listUserSessions(userId: string): Promise<SessionRow[]> {
  const db = getDbClient();
  const res = await db.query(
    `
    select *
    from prowork.sessions
    where user_id = $1
    order by created_at desc
    limit 50
    `,
    [userId]
  );
  return res.rows as SessionRow[];
}
