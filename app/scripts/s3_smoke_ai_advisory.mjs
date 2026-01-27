import http from "http";

const port = Number(process.env.PORT || 8080);
const devSecret = process.env.DEV_AUTH_SECRET;

if (!devSecret) {
  throw new Error("Missing DEV_AUTH_SECRET in environment");
}

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": payload.length,
          ...headers
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          let json = {};
          try { json = JSON.parse(data || "{}"); } catch {}
          resolve({ status: res.statusCode, json, raw: data });
        });
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const actorId = "00000000-0000-0000-0000-000000000001";
  const jobId = "00000000-0000-0000-0000-000000000010";

  const mint = await post(
    "/api/auth/dev/session",
    { actorId },
    { "x-dev-secret": devSecret }
  );

  process.stdout.write(JSON.stringify({ step: "mint_session", port, ...mint }, null, 2) + "\n");

  const token = mint?.json?.token;
  if (!token) {
    throw new Error("Missing token from /api/auth/dev/session");
  }

  const authz = { Authorization: `Bearer ${token}` };

  const gen = await post(
    "/api/ai/recommendations/generate",
    {
      jobId,
      requiredSkills: ["react", "typescript", "node"],
      candidates: [
        { candidateId: "00000000-0000-0000-0000-000000000101", skills: ["react", "typescript"] },
        { candidateId: "00000000-0000-0000-0000-000000000102", skills: ["node", "postgres"] },
        { candidateId: "00000000-0000-0000-0000-000000000103", skills: ["react", "node", "typescript"] }
      ]
    },
    authz
  );

  process.stdout.write(JSON.stringify({ step: "generate", port, ...gen }, null, 2) + "\n");

  const recommendationId = gen?.json?.recommendationId;
  if (!recommendationId) {
    throw new Error("Missing recommendationId from generate");
  }

  const viewed = await post("/api/ai/recommendations/viewed", { recommendationId, jobId }, authz);
  process.stdout.write(JSON.stringify({ step: "viewed", port, ...viewed }, null, 2) + "\n");

  const select = await post(
    "/api/ai/recommendations/select",
    { recommendationId, jobId, candidateId: "00000000-0000-0000-0000-000000000103" },
    authz
  );
  process.stdout.write(JSON.stringify({ step: "select", port, ...select }, null, 2) + "\n");

  const override = await post(
    "/api/ai/recommendations/override",
    {
      recommendationId,
      jobId,
      originalOutput: { ranked: ["a", "b"] },
      overrideAction: { selectedCandidateId: "manual_choice" },
      reason: "Human override for domain experience"
    },
    authz
  );
  process.stdout.write(JSON.stringify({ step: "override", port, ...override }, null, 2) + "\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + "\n");
  process.exit(1);
});
