import http from "http";
import crypto from "crypto";
import pg from "pg";

const { Pool } = pg;

function readJson(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function getRequestMeta(req) {
  const userAgent = req.headers["user-agent"] || null;
  const forwardedFor = req.headers["x-forwarded-for"] || null;
  const ip = forwardedFor ? String(forwardedFor).split(",")[0]?.trim() || null : null;
  return { ip, userAgent: userAgent ? String(userAgent) : null };
}

function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function parseBearer(req) {
  const h = req.headers["authorization"];
  if (!h) return null;
  const s = String(h);
  if (!s.toLowerCase().startsWith("bearer ")) return null;
  const token = s.slice(7).trim();
  return token.length ? token : null;
}

function overlapScore(required, candidateSkills) {
  const req = new Set(required.map(s => String(s).toLowerCase().trim()).filter(Boolean));
  const cand = new Set(candidateSkills.map(s => String(s).toLowerCase().trim()).filter(Boolean));
  if (req.size === 0) return 0;

  let hit = 0;
  for (const s of req) {
    if (cand.has(s)) hit += 1;
  }
  return (hit / req.size) * 100;
}

function generateAdvisoryRecommendation(jobId, requiredSkills, candidates) {
  const ranked = candidates
    .map(c => {
      const score = overlapScore(requiredSkills, c.skills || []);
      const lower = (c.skills || []).map(x => String(x).toLowerCase());
      const reasons = {
        required_skills_matched_percent: score,
        matched_required: requiredSkills.filter(rs => lower.includes(String(rs).toLowerCase())),
        missing_required: requiredSkills.filter(rs => !lower.includes(String(rs).toLowerCase()))
      };
      return { candidateId: c.candidateId, score: Math.round(score * 100) / 100, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  const podSuggestions = ranked.length >= 3
    ? [
        {
          podId: "pod_suggestion_1",
          members: ranked.slice(0, 3).map(r => r.candidateId),
          rationale: "Top skill-overlap candidates grouped for balanced coverage. Advisory only."
        },
        {
          podId: "pod_suggestion_2",
          members: ranked.slice(1, 4).map(r => r.candidateId),
          rationale: "Alternative composition for redundancy. Advisory only."
        }
      ]
    : [];

  return {
    modelName: "prowork-advisory-ranker",
    modelVersion: "s3.2",
    advisoryOnly: true,
    jobId,
    ranked,
    podSuggestions
  };
}

async function main() {
  const connectionString = process.env.DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DB_URL or DATABASE_URL");
  }

  const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000 });

  async function requireSession(req) {
    const token = parseBearer(req);
    if (!token) return { ok: false, status: 401, error: "Missing Bearer token" };

    const tokenHash = sha256Hex(token);
    const meta = getRequestMeta(req);

    const q = await pool.query(
      `
        select id, actor_id, expires_at, revoked_at
        from public.auth_sessions
        where token_hash = $1
        limit 1
      `,
      [tokenHash]
    );

    if (q.rowCount === 0) return { ok: false, status: 401, error: "Invalid token" };

    const row = q.rows[0];
    if (row.revoked_at) return { ok: false, status: 401, error: "Token revoked" };
    if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, status: 401, error: "Token expired" };

    await pool.query(
      `
        update public.auth_sessions
        set last_seen_at = now(), ip = $2::inet, user_agent = $3
        where id = $1::uuid
      `,
      [row.id, meta.ip, meta.userAgent]
    );

    return { ok: true, actorId: row.actor_id, sessionId: row.id };
  }

  async function logAuditEvent(e) {
    await pool.query(
      `
        insert into public.audit_events
          (event_type, actor_id, subject_type, subject_id, recommendation_id, job_id, ip, user_agent, metadata)
        values
          ($1, $2::uuid, $3, $4::uuid, $5::uuid, $6::uuid, $7::inet, $8, $9::jsonb)
      `,
      [
        e.eventType,
        e.actorId,
        e.subjectType || null,
        e.subjectId || null,
        e.recommendationId || null,
        e.jobId || null,
        e.ip || null,
        e.userAgent || null,
        JSON.stringify(e.metadata || {})
      ]
    );
  }

  async function insertAction(recommendationId, actionType, actorId, payload) {
    await pool.query(
      `
        insert into public.ai_recommendation_actions
          (recommendation_id, action_type, actor_id, candidate_id, reason, original_output, override_action)
        values
          ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6::jsonb, $7::jsonb)
      `,
      [
        recommendationId,
        actionType,
        actorId,
        payload?.candidateId || null,
        payload?.reason || null,
        payload?.originalOutput ? JSON.stringify(payload.originalOutput) : null,
        payload?.overrideAction ? JSON.stringify(payload.overrideAction) : null
      ]
    );
  }

  async function mintDevSession(req, res) {
    const devSecret = process.env.DEV_AUTH_SECRET;
    if (!devSecret) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: "DEV_AUTH_SECRET not set" }));
      return;
    }

    const provided = String(req.headers["x-dev-secret"] || "");
    if (provided !== devSecret) {
      res.statusCode = 403;
      res.end(JSON.stringify({ ok: false, error: "Forbidden" }));
      return;
    }

    const body = await readJson(req);
    const actorId = body?.actorId;
    if (!actorId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: "Missing actorId" }));
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(token);

    const expiresMinutes = Number(process.env.SESSION_EXPIRES_MINUTES || 120);
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();

    const meta = getRequestMeta(req);

    await pool.query(
      `
        insert into public.auth_sessions (actor_id, token_hash, expires_at, ip, user_agent)
        values ($1::uuid, $2, $3::timestamptz, $4::inet, $5)
      `,
      [actorId, tokenHash, expiresAt, meta.ip, meta.userAgent]
    );

    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, token, expiresAt }));
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");

    const url = req.url || "";
    const method = req.method || "GET";

    if (method === "GET" && url === "/api/health") {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (method === "POST" && url === "/api/auth/dev/session") {
      await mintDevSession(req, res);
      return;
    }

    const meta = getRequestMeta(req);
    const session = await requireSession(req);
    if (!session.ok) {
      res.statusCode = session.status;
      res.end(JSON.stringify({ ok: false, error: session.error }));
      return;
    }

    const actorId = session.actorId;
    const body = method === "POST" ? await readJson(req) : {};

    if (method === "POST" && url === "/api/ai/recommendations/generate") {
      const { jobId, requiredSkills, candidates } = body || {};
      if (!jobId || !Array.isArray(requiredSkills) || !Array.isArray(candidates)) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: "Invalid payload" }));
        return;
      }

      const rec = generateAdvisoryRecommendation(jobId, requiredSkills, candidates);

      const recInsert = await pool.query(
        `
          insert into public.ai_recommendations
            (job_id, created_by, model_name, model_version, advisory_only, output)
          values
            ($1::uuid, $2::uuid, $3, $4, true, $5::jsonb)
          returning id
        `,
        [jobId, actorId, rec.modelName, rec.modelVersion, JSON.stringify(rec)]
      );

      const recommendationId = recInsert.rows[0].id;

      for (const r of rec.ranked) {
        await pool.query(
          `
            insert into public.ai_recommendation_candidates
              (recommendation_id, candidate_id, score, reasons)
            values
              ($1::uuid, $2::uuid, $3, $4::jsonb)
          `,
          [recommendationId, r.candidateId, r.score, JSON.stringify(r.reasons)]
        );
      }

      await logAuditEvent({
        eventType: "ai.recommendation_generated",
        actorId,
        recommendationId,
        jobId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { advisory_only: true, model: rec.modelName, version: rec.modelVersion }
      });

      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, recommendationId, advisoryOnly: true }));
      return;
    }

    if (method === "POST" && url === "/api/ai/recommendations/viewed") {
      const { recommendationId, jobId } = body || {};
      if (!recommendationId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: "Missing recommendationId" }));
        return;
      }

      await insertAction(recommendationId, "viewed", actorId, {});
      await logAuditEvent({
        eventType: "ai.recommendation_viewed",
        actorId,
        recommendationId,
        jobId: jobId || null,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: {}
      });

      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (method === "POST" && url === "/api/ai/recommendations/select") {
      const { recommendationId, jobId, candidateId } = body || {};
      if (!recommendationId || !candidateId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: "Missing recommendationId or candidateId" }));
        return;
      }

      await insertAction(recommendationId, "candidate_selected", actorId, { candidateId });
      await logAuditEvent({
        eventType: "ai.candidate_selected",
        actorId,
        recommendationId,
        jobId: jobId || null,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { candidate_id: candidateId }
      });

      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, advisoryOnly: true }));
      return;
    }

    if (method === "POST" && url === "/api/ai/recommendations/override") {
      const { recommendationId, jobId, originalOutput, overrideAction, reason } = body || {};
      if (!recommendationId || !originalOutput || !overrideAction || !reason) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: "Missing override fields" }));
        return;
      }

      await insertAction(recommendationId, "override_recorded", actorId, { originalOutput, overrideAction, reason });

      await logAuditEvent({
        eventType: "ai.override_recorded",
        actorId,
        recommendationId,
        jobId: jobId || null,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason, override_action: overrideAction }
      });

      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, advisoryOnly: true }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
  });

  const port = Number(process.env.PORT || 8080);

  process.stdout.write(
    "\nS3 Governance Banner (BINDING)\n" +
    "AI is advisory only (A4). HARD BLOCK: no auto-hire, no auto-assign, no contract execution.\n" +
    "HITL required. Audit logs capture AI outputs + human overrides (A7).\n" +
    "Auth: Bearer session required for all AI endpoints.\n\n"
  );

  server.listen(port, () => {
    process.stdout.write(`S3 advisory server listening on ${port}\n`);
  });
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exit(1);
});
