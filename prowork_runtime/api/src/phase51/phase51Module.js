const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function nowIso() { return new Date().toISOString(); }
function makeId(prefix) { return `${prefix}_${crypto.randomUUID()}`; }

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (_) { return fallback; }
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function json(res, statusCode, body) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

function matchPath(pattern, pathname) {
  const regex = new RegExp("^" + pattern.replace(/:[^/]+/g, "([^/]+)") + "$");
  const match = pathname.match(regex);
  return match ? match.slice(1) : null;
}

function createPhase51Module(config) {
  const { dataDir, eventLogFile, resolveState, getActor } = config;
  const certificationFile = path.join(dataDir, "phase51-certifications.json");

  function appendEvent(type, payload, actor) {
    const line = JSON.stringify({ eventId: makeId("evt"), type, at: nowIso(), actor, payload });
    fs.mkdirSync(path.dirname(eventLogFile), { recursive: true });
    fs.appendFileSync(eventLogFile, line + "\n");
  }

  function getCertifications() { return readJson(certificationFile, []); }
  function saveCertifications(items) { writeJsonAtomic(certificationFile, items); }
  function listByEvidencePack(evidencePackId) { return getCertifications().filter((i) => i.evidencePackId === evidencePackId); }
  function findById(certificationId) { return getCertifications().find((i) => i.certificationId === certificationId) || null; }

  function createCertification(evidencePackId, body, actor) {
    const state = resolveState();
    const evidencePack = state.evidencePacks.find((i) => i.evidencePackId === evidencePackId);
    if (!evidencePack) return { status: 404, body: { ok: false, code: "EVIDENCE_PACK_NOT_FOUND", data: null, errors: [{ field: "evidencePackId", message: "Evidence pack not found" }], meta: {} } };
    if (actor.actorRole !== "board_operator") return { status: 403, body: { ok: false, code: "CERTIFICATION_FORBIDDEN", data: null, errors: [{ field: "x-actor-role", message: "Only board_operator may create certifications" }], meta: {} } };

    const title = String((body && body.title) || "").trim();
    const summary = String((body && body.summary) || "").trim();
    const certificationType = String((body && body.certificationType) || "").trim();
    const missing = [];
    if (!actor.actorId) missing.push("x-actor-id");
    if (!title) missing.push("title");
    if (!summary) missing.push("summary");
    if (!certificationType) missing.push("certificationType");
    if (missing.length > 0) return { status: 422, body: { ok: false, code: "CERTIFICATION_INVALID", data: null, errors: [{ field: "payload", message: "Missing required fields", fields: missing }], meta: {} } };

    const item = {
      certificationId: makeId("certification"),
      evidencePackId,
      deliveryArtifactId: evidencePack.deliveryArtifactId,
      workItemId: evidencePack.workItemId,
      opportunityId: evidencePack.opportunityId,
      title, summary, certificationType,
      certificationState: "CERTIFIED",
      auditExportState: "EXPORT_READY",
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    const next = getCertifications();
    next.push(item);
    saveCertifications(next);

    appendEvent("CLOSURE_CERTIFICATION_CREATED", { certificationId: item.certificationId, evidencePackId, deliveryArtifactId: item.deliveryArtifactId }, actor);
    appendEvent("AUDIT_EXPORT_GENERATED", { certificationId: item.certificationId, auditExportState: item.auditExportState }, actor);
    appendEvent("COMMAND_CENTER_CERTIFICATION_UPDATED", { certificationCount: next.length }, actor);

    return { status: 201, body: { ok: true, code: "CLOSURE_CERTIFICATION_CREATED", data: { item }, errors: [], meta: {} } };
  }

  function buildAuditExport(certificationId) {
    const state = resolveState();
    const certification = findById(certificationId);
    if (!certification) return { status: 404, body: { ok: false, code: "CERTIFICATION_NOT_FOUND", data: null, errors: [{ field: "certificationId", message: "Certification not found" }], meta: {} } };
    const evidencePack = state.evidencePacks.find((i) => i.evidencePackId === certification.evidencePackId) || null;
    const deliveryArtifact = state.deliveryArtifacts.find((i) => i.deliveryArtifactId === certification.deliveryArtifactId) || null;
    const workItem = state.workItems.find((i) => i.workItemId === certification.workItemId) || null;
    const opportunity = state.opportunities.find((i) => i.opportunityId === certification.opportunityId) || null;
    return { status: 200, body: { ok: true, code: "AUDIT_EXPORT_FETCHED", data: { certification, evidencePack, deliveryArtifact, workItem, opportunity, generatedAt: nowIso() }, errors: [], meta: {} } };
  }

  async function route(req, res, pathname, method, body) {
    let match;

    // Evidence packs certifications — GET
    match = matchPath("/api/evidence-packs/:id/certifications", pathname);
    if (method === "GET" && match) {
      const [evidencePackId] = match;
      const state = resolveState();
      const exists = state.evidencePacks.find((i) => i.evidencePackId === evidencePackId);
      if (!exists) return json(res, 404, { ok: false, code: "EVIDENCE_PACK_NOT_FOUND", data: null, errors: [{ field: "evidencePackId", message: "Evidence pack not found" }], meta: {} });
      const items = listByEvidencePack(evidencePackId);
      return json(res, 200, { ok: true, code: "CERTIFICATION_LIST_FETCHED", data: { evidencePackId, items, count: items.length }, errors: [], meta: {} });
    }

    // Evidence packs certifications — POST
    match = matchPath("/api/evidence-packs/:id/certifications", pathname);
    if (method === "POST" && match) {
      const [evidencePackId] = match;
      const result = createCertification(evidencePackId, body, getActor(req));
      return json(res, result.status, result.body);
    }

    // All certifications — GET
    if (method === "GET" && pathname === "/api/certifications") {
      const items = getCertifications();
      return json(res, 200, { ok: true, code: "CERTIFICATION_LIST_FETCHED", data: { items, count: items.length }, errors: [], meta: {} });
    }

    // Certification audit-export — specific before generic
    match = matchPath("/api/certifications/:id/audit-export", pathname);
    if (method === "GET" && match) {
      const [certificationId] = match;
      const result = buildAuditExport(certificationId);
      return json(res, result.status, result.body);
    }

    // Certification by ID
    match = matchPath("/api/certifications/:id", pathname);
    if (method === "GET" && match) {
      const [certificationId] = match;
      const item = findById(certificationId);
      if (!item) return json(res, 404, { ok: false, code: "CERTIFICATION_NOT_FOUND", data: null, errors: [{ field: "certificationId", message: "Certification not found" }], meta: {} });
      return json(res, 200, { ok: true, code: "CERTIFICATION_DETAIL_FETCHED", data: { item }, errors: [], meta: {} });
    }

    return false;
  }

  return { route };
}

module.exports = { createPhase51Module };
