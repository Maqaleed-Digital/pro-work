// Wraps audit-trail endpoints for the brief §6 Audit-trail viewer.
//
// Backend reality:
//   GET /api/admin/ai/audit-log[?reviewerDecision=&actionType=&limit=]
//                                    — AI audit log (S36-G2). Covers
//                                      agent actions + human approvals
//                                      via reviewer_decision field.
//   GET /api/evidence/audit          — tenant evidence-access audit
//                                      (S38-G3 evidence pack router).
//
// Data changes (per brief §6) are NOT directly exposed by a customer-
// facing endpoint today. VERITAS event-log surfacing is operator-only
// per UX-G2-INV-001 §3.6 OBL F-03. Per PROPOSAL §11.A4 the surface
// labels the "data changes" filter as "Coming later".

import { apiGetJson } from "../api.js"

/**
 * @typedef {object} AuditEntry
 * @property {string} id
 * @property {string} type           — 'agent_action' | 'human_approval' | 'evidence_access'
 * @property {string} actionType     — backend action_type (e.g., 'nitaqat_move')
 * @property {string|null} actorId
 * @property {string|null} actorRole
 * @property {string|null} agentName
 * @property {string|null} reviewerDecision   — 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'OVERRIDDEN'
 * @property {string|null} rationale
 * @property {number|null} confidence
 * @property {string} timestamp
 * @property {string|null} correlationId
 */

/**
 * Fetch the unified audit trail. Merges AI audit log + evidence
 * pack access audit into a single chronological list.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit=50]
 * @returns {Promise<{entries: AuditEntry[]}>}
 */
export async function listAuditTrail(opts = {}) {
  const limit = Math.max(1, Math.min(200, opts.limit || 50))

  const [aiRes, evRes] = await Promise.allSettled([
    apiGetJson("/api/admin/ai/audit-log", { limit }),
    apiGetJson("/api/evidence/audit", { limit }),
  ])

  const entries = []
  if (aiRes.status === "fulfilled" && aiRes.value && Array.isArray(aiRes.value.items)) {
    for (const it of aiRes.value.items) {
      entries.push(normaliseAi(it))
    }
  }
  if (evRes.status === "fulfilled" && Array.isArray(evRes.value && evRes.value.events)) {
    for (const ev of evRes.value.events) {
      entries.push(normaliseEvidenceAccess(ev))
    }
  }

  // Chronological newest-first
  entries.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))

  return { entries: entries.slice(0, limit) }
}

function normaliseAi(it) {
  const decision = it.reviewer_decision || it.reviewerDecision || null
  const type = decision && decision !== "PENDING" ? "human_approval" : "agent_action"
  return {
    id: it.id || "",
    type,
    actionType: it.action_type || it.actionType || "",
    actorId: it.reviewed_by || it.reviewedBy || it.actor_id || null,
    actorRole: null,
    agentName: agentNameFromActionType(it.action_type || it.actionType),
    reviewerDecision: decision,
    rationale: it.rationale || it.override_reason || null,
    confidence: typeof it.confidence_score === "number" ? it.confidence_score : null,
    timestamp: it.reviewed_at || it.reviewedAt || it.created_at || it.createdAt || null,
    correlationId: it.correlation_id || it.correlationId || it.id || null,
  }
}

function normaliseEvidenceAccess(ev) {
  return {
    id: `evidence-${ev.timestamp || ""}-${ev.pack_id || ""}`,
    type: "evidence_access",
    actionType: ev.event || "evidence_access",
    actorId: null,
    actorRole: ev.actor_role || null,
    agentName: null,
    reviewerDecision: null,
    rationale: null,
    confidence: null,
    timestamp: ev.timestamp || null,
    correlationId: ev.pack_id || null,
  }
}

function agentNameFromActionType(t) {
  const k = String(t || "").toLowerCase()
  if (k.includes("saudi") || k.includes("nitaqat")) return "WorkCaptain Saudisation Advisor"
  if (k.includes("hiring") || k.includes("role")) return "WorkCaptain Hiring Advisor"
  if (k.includes("compliance") || k.includes("occupation")) return "WorkCaptain Compliance Advisor"
  return "WorkCaptain Advisor"
}
