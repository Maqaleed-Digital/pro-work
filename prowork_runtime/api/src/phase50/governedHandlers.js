const { readState, writeState, id, nowIso } = require("./governedStore");
const { makeEvent } = require("./eventEnvelope");
const { ok, created, rejected } = require("./response");
const { canCreateEvidencePack, initialTrustState, initialExportState } = require("./authz");

function appendEvent(state, event) { state.events.push(event); }

function executionQueueCount(state) {
  return state.workItems.filter((i) => i.status === "READY" || i.status === "IN_PROGRESS").length;
}

function getCommandCenterState() {
  const state = readState();
  return ok("COMMAND_CENTER_STATE_FETCHED", {
    summary: {
      intakeCount: state.intakes.length,
      opportunityCount: state.opportunities.length,
      approvalCount: state.approvals.length,
      workItemCount: state.workItems.length,
      completedWorkItemCount: state.workItems.filter((i) => i.status === "COMPLETED").length,
      deliveryArtifactCount: state.deliveryArtifacts.length,
      evidencePackCount: state.evidencePacks.length,
      executionQueueCount: executionQueueCount(state),
      eventCount: state.events.length
    },
    latestOpportunity: state.opportunities[state.opportunities.length - 1] || null,
    latestWorkItem: state.workItems[state.workItems.length - 1] || null,
    latestDeliveryArtifact: state.deliveryArtifacts[state.deliveryArtifacts.length - 1] || null,
    latestEvidencePack: state.evidencePacks[state.evidencePacks.length - 1] || null,
    updatedAt: state.updatedAt
  });
}

function getOpportunities() {
  const state = readState();
  return ok("OPPORTUNITY_LIST_FETCHED", { items: state.opportunities, count: state.opportunities.length, updatedAt: state.updatedAt });
}

function getOpportunityById(opportunityId) {
  const state = readState();
  const opp = state.opportunities.find((i) => i.opportunityId === opportunityId);
  if (!opp) return rejected(404, "OPPORTUNITY_NOT_FOUND", [{ field: "opportunityId", message: "Opportunity not found" }]);
  return ok("OPPORTUNITY_DETAIL_FETCHED", { item: opp, updatedAt: state.updatedAt });
}

function getDecisionAudit(opportunityId) {
  const state = readState();
  const opp = state.opportunities.find((i) => i.opportunityId === opportunityId);
  if (!opp) return rejected(404, "OPPORTUNITY_NOT_FOUND", [{ field: "opportunityId", message: "Opportunity not found" }]);
  const items = state.approvals.filter((i) => i.opportunityId === opportunityId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return ok("DECISION_AUDIT_FETCHED", { opportunityId, items, count: items.length, updatedAt: state.updatedAt });
}

function getBoardQueue() {
  const state = readState();
  const items = state.opportunities.filter((i) => i.stage === "BOARD_REVIEW");
  return ok("BOARD_QUEUE_FETCHED", { items, count: items.length, updatedAt: state.updatedAt });
}

function getEvents() {
  const state = readState();
  return ok("EVENTS_FETCHED", { items: state.events, count: state.events.length, updatedAt: state.updatedAt });
}

function getWorkItemsForOpportunity(opportunityId) {
  const state = readState();
  const opp = state.opportunities.find((i) => i.opportunityId === opportunityId);
  if (!opp) return rejected(404, "OPPORTUNITY_NOT_FOUND", [{ field: "opportunityId", message: "Opportunity not found" }]);
  const items = state.workItems.filter((i) => i.opportunityId === opportunityId);
  return ok("WORK_ITEM_LIST_FETCHED", { opportunityId, items, count: items.length, updatedAt: state.updatedAt });
}

function getWorkItems() {
  const state = readState();
  return ok("WORK_ITEM_LIST_FETCHED", { items: state.workItems, count: state.workItems.length, updatedAt: state.updatedAt });
}

function getWorkItemById(workItemId) {
  const state = readState();
  const item = state.workItems.find((i) => i.workItemId === workItemId);
  if (!item) return rejected(404, "WORK_ITEM_NOT_FOUND", [{ field: "workItemId", message: "Work item not found" }]);
  const transitions = state.workItemTransitions.filter((t) => t.workItemId === workItemId);
  const deliveryArtifacts = state.deliveryArtifacts.filter((d) => d.workItemId === workItemId);
  return ok("WORK_ITEM_DETAIL_FETCHED", { item, transitions, deliveryArtifacts, updatedAt: state.updatedAt });
}

function getExecutionQueue() {
  const state = readState();
  const items = state.workItems.filter((i) => i.status === "READY" || i.status === "IN_PROGRESS");
  return ok("EXECUTION_QUEUE_FETCHED", { items, count: items.length, updatedAt: state.updatedAt });
}

function getDeliveryArtifactsForWorkItem(workItemId) {
  const state = readState();
  const wItem = state.workItems.find((i) => i.workItemId === workItemId);
  if (!wItem) return rejected(404, "WORK_ITEM_NOT_FOUND", [{ field: "workItemId", message: "Work item not found" }]);
  const items = state.deliveryArtifacts.filter((i) => i.workItemId === workItemId);
  return ok("DELIVERY_ARTIFACT_LIST_FETCHED", { workItemId, items, count: items.length, updatedAt: state.updatedAt });
}

function getDeliveryArtifacts() {
  const state = readState();
  return ok("DELIVERY_ARTIFACT_LIST_FETCHED", { items: state.deliveryArtifacts, count: state.deliveryArtifacts.length, updatedAt: state.updatedAt });
}

function getDeliveryArtifactById(deliveryArtifactId) {
  const state = readState();
  const item = state.deliveryArtifacts.find((i) => i.deliveryArtifactId === deliveryArtifactId);
  if (!item) return rejected(404, "DELIVERY_ARTIFACT_NOT_FOUND", [{ field: "deliveryArtifactId", message: "Delivery artifact not found" }]);
  const evidencePacks = state.evidencePacks.filter((i) => i.deliveryArtifactId === deliveryArtifactId);
  return ok("DELIVERY_ARTIFACT_DETAIL_FETCHED", { item, evidencePacks, updatedAt: state.updatedAt });
}

function getEvidencePacksForDeliveryArtifact(deliveryArtifactId) {
  const state = readState();
  const da = state.deliveryArtifacts.find((i) => i.deliveryArtifactId === deliveryArtifactId);
  if (!da) return rejected(404, "DELIVERY_ARTIFACT_NOT_FOUND", [{ field: "deliveryArtifactId", message: "Delivery artifact not found" }]);
  const items = state.evidencePacks.filter((i) => i.deliveryArtifactId === deliveryArtifactId);
  return ok("EVIDENCE_PACK_LIST_FETCHED", { deliveryArtifactId, items, count: items.length, updatedAt: state.updatedAt });
}

function getEvidencePacks() {
  const state = readState();
  return ok("EVIDENCE_PACK_LIST_FETCHED", { items: state.evidencePacks, count: state.evidencePacks.length, updatedAt: state.updatedAt });
}

function getEvidencePackById(evidencePackId) {
  const state = readState();
  const item = state.evidencePacks.find((i) => i.evidencePackId === evidencePackId);
  if (!item) return rejected(404, "EVIDENCE_PACK_NOT_FOUND", [{ field: "evidencePackId", message: "Evidence pack not found" }]);
  return ok("EVIDENCE_PACK_DETAIL_FETCHED", { item, updatedAt: state.updatedAt });
}

function createIntake(input) {
  const missing = ["tenantId", "requesterId", "title", "summary"].filter((key) => !input || typeof input[key] !== "string" || input[key].trim() === "");
  if (missing.length > 0) return rejected(422, "INTAKE_INVALID", [{ message: "Missing required fields", fields: missing }]);
  if (input.title.trim().length < 3) return rejected(422, "INTAKE_INVALID", [{ field: "title", message: "title must be at least 3 characters" }]);
  if (input.summary.trim().length < 10) return rejected(422, "INTAKE_INVALID", [{ field: "summary", message: "summary must be at least 10 characters" }]);

  const state = readState();
  const intake = { intakeId: id("intake"), tenantId: input.tenantId.trim(), requesterId: input.requesterId.trim(), title: input.title.trim(), summary: input.summary.trim(), createdAt: nowIso(), status: "INTAKE_ACCEPTED" };
  const opportunity = { opportunityId: id("opp"), intakeId: intake.intakeId, tenantId: intake.tenantId, title: intake.title, summary: intake.summary, stage: "COMMAND_VISIBLE", createdAt: nowIso(), updatedAt: nowIso() };
  state.intakes.push(intake);
  state.opportunities.push(opportunity);

  appendEvent(state, makeEvent({ eventType: "INTAKE_CREATED", aggregateType: "INTAKE", aggregateId: intake.intakeId, actorId: intake.requesterId, actorRole: "requester", payload: { intakeId: intake.intakeId, tenantId: intake.tenantId } }));
  appendEvent(state, makeEvent({ eventType: "OPPORTUNITY_REGISTERED", aggregateType: "OPPORTUNITY", aggregateId: opportunity.opportunityId, actorId: intake.requesterId, actorRole: "requester", payload: { opportunityId: opportunity.opportunityId, intakeId: intake.intakeId } }));
  appendEvent(state, makeEvent({ eventType: "COMMAND_CENTER_STATE_UPDATED", aggregateType: "COMMAND_STATE", aggregateId: "GLOBAL", actorId: "system", actorRole: "system_viewer", payload: { intakeCount: state.intakes.length, opportunityCount: state.opportunities.length } }));

  writeState(state);
  return created("INTAKE_CREATED", { intake, opportunity, commandCenter: { intakeCount: state.intakes.length, opportunityCount: state.opportunities.length, eventCount: state.events.length } });
}

function advanceOpportunityStage(opportunityId, input, headers) {
  const actorId = String(headers["x-actor-id"] || "").trim();
  const actorRole = String(headers["x-actor-role"] || "").trim();
  const toStage = String((input && input.toStage) || "").trim();
  if (actorRole !== "board_operator") return rejected(403, "ADVANCE_FORBIDDEN", [{ field: "x-actor-role", message: "Only board_operator may advance opportunity stage" }]);
  const state = readState();
  const opp = state.opportunities.find((i) => i.opportunityId === opportunityId);
  if (!opp) return rejected(404, "OPPORTUNITY_NOT_FOUND", [{ field: "opportunityId", message: "Opportunity not found" }]);
  if (!(opp.stage === "COMMAND_VISIBLE" && toStage === "BOARD_REVIEW")) return rejected(422, "STAGE_INVALID", [{ field: "toStage", message: `Transition ${opp.stage} -> ${toStage} is not allowed` }]);
  const fromStage = opp.stage;
  opp.stage = toStage;
  opp.updatedAt = nowIso();
  appendEvent(state, makeEvent({ eventType: "OPPORTUNITY_STAGE_ADVANCED", aggregateType: "OPPORTUNITY", aggregateId: opp.opportunityId, actorId, actorRole, payload: { opportunityId: opp.opportunityId, fromStage, toStage } }));
  appendEvent(state, makeEvent({ eventType: "BOARD_QUEUE_STATE_UPDATED", aggregateType: "BOARD_QUEUE", aggregateId: "GLOBAL", actorId, actorRole, payload: { opportunityId: opp.opportunityId, stage: opp.stage } }));
  writeState(state);
  return ok("OPPORTUNITY_STAGE_ADVANCED", { item: opp, eventCount: state.events.length });
}

function approveOpportunity(opportunityId, input, headers) {
  const actorId = String(headers["x-actor-id"] || "").trim();
  const actorRole = String(headers["x-actor-role"] || "").trim();
  const reason = String((input && input.reason) || "").trim();
  const state = readState();
  const opp = state.opportunities.find((i) => i.opportunityId === opportunityId);
  if (!opp) return rejected(404, "OPPORTUNITY_NOT_FOUND", [{ field: "opportunityId", message: "Opportunity not found" }]);
  if (actorRole !== "board_operator") return rejected(403, "DECISION_FORBIDDEN", [{ field: "x-actor-role", message: "Only board_operator may approve" }]);
  if (opp.stage !== "BOARD_REVIEW") return rejected(422, "DECISION_INVALID", [{ field: "stage", message: "Decision allowed only in BOARD_REVIEW" }]);
  const approval = { approvalId: id("approval"), opportunityId, decisionType: "APPROVE", actorId, actorRole, reason, createdAt: nowIso() };
  state.approvals.push(approval);
  opp.stage = "APPROVED";
  opp.updatedAt = nowIso();
  appendEvent(state, makeEvent({ eventType: "APPROVAL_RECORDED", aggregateType: "APPROVAL", aggregateId: approval.approvalId, actorId, actorRole, payload: { approvalId: approval.approvalId, opportunityId, decisionType: "APPROVE" } }));
  appendEvent(state, makeEvent({ eventType: "OPPORTUNITY_APPROVED", aggregateType: "OPPORTUNITY", aggregateId: opportunityId, actorId, actorRole, payload: { opportunityId, approvalId: approval.approvalId, finalStage: "APPROVED" } }));
  appendEvent(state, makeEvent({ eventType: "DECISION_AUDIT_UPDATED", aggregateType: "DECISION_AUDIT", aggregateId: opportunityId, actorId, actorRole, payload: { opportunityId, decisionCount: state.approvals.filter((i) => i.opportunityId === opportunityId).length } }));
  writeState(state);
  return ok("OPPORTUNITY_APPROVED", { item: opp, approval, eventCount: state.events.length });
}

function rejectOpportunity(opportunityId, input, headers) {
  const actorId = String(headers["x-actor-id"] || "").trim();
  const actorRole = String(headers["x-actor-role"] || "").trim();
  const state = readState();
  const opp = state.opportunities.find((i) => i.opportunityId === opportunityId);
  if (!opp) return rejected(404, "OPPORTUNITY_NOT_FOUND", [{ field: "opportunityId", message: "Opportunity not found" }]);
  if (actorRole !== "board_operator") return rejected(403, "DECISION_FORBIDDEN", [{ field: "x-actor-role", message: "Only board_operator may reject" }]);
  if (opp.stage !== "BOARD_REVIEW") return rejected(422, "DECISION_INVALID", [{ field: "stage", message: "Decision allowed only in BOARD_REVIEW" }]);
  const approval = { approvalId: id("approval"), opportunityId, decisionType: "REJECT", actorId, actorRole, reason: String((input && input.reason) || "").trim(), createdAt: nowIso() };
  state.approvals.push(approval);
  opp.stage = "REJECTED";
  opp.updatedAt = nowIso();
  appendEvent(state, makeEvent({ eventType: "APPROVAL_RECORDED", aggregateType: "APPROVAL", aggregateId: approval.approvalId, actorId, actorRole, payload: { approvalId: approval.approvalId, opportunityId, decisionType: "REJECT" } }));
  appendEvent(state, makeEvent({ eventType: "OPPORTUNITY_REJECTED", aggregateType: "OPPORTUNITY", aggregateId: opportunityId, actorId, actorRole, payload: { opportunityId, approvalId: approval.approvalId, finalStage: "REJECTED" } }));
  appendEvent(state, makeEvent({ eventType: "DECISION_AUDIT_UPDATED", aggregateType: "DECISION_AUDIT", aggregateId: opportunityId, actorId, actorRole, payload: { opportunityId, decisionCount: state.approvals.filter((i) => i.opportunityId === opportunityId).length } }));
  writeState(state);
  return ok("OPPORTUNITY_REJECTED", { item: opp, approval, eventCount: state.events.length });
}

function createWorkItem(opportunityId, input, headers) {
  const actorId = String(headers["x-actor-id"] || "").trim();
  const actorRole = String(headers["x-actor-role"] || "").trim();
  const state = readState();
  const opp = state.opportunities.find((i) => i.opportunityId === opportunityId);
  if (!opp) return rejected(404, "OPPORTUNITY_NOT_FOUND", [{ field: "opportunityId", message: "Opportunity not found" }]);
  if (opp.stage !== "APPROVED") return rejected(422, "WORK_ITEM_INVALID", [{ field: "stage", message: "Work item creation allowed only in APPROVED" }]);
  if (actorRole !== "board_operator") return rejected(403, "WORK_ITEM_FORBIDDEN", [{ field: "x-actor-role", message: "Only board_operator may create work items" }]);
  const workItem = { workItemId: id("workitem"), opportunityId, title: String((input && input.title) || "").trim(), summary: String((input && input.summary) || "").trim(), status: "READY", queueState: "EXECUTION_VISIBLE", actorId, actorRole, createdAt: nowIso(), updatedAt: nowIso() };
  state.workItems.push(workItem);
  appendEvent(state, makeEvent({ eventType: "WORK_ITEM_CREATED", aggregateType: "WORK_ITEM", aggregateId: workItem.workItemId, actorId, actorRole, payload: { workItemId: workItem.workItemId, opportunityId } }));
  appendEvent(state, makeEvent({ eventType: "EXECUTION_QUEUE_UPDATED", aggregateType: "EXECUTION_QUEUE", aggregateId: "GLOBAL", actorId, actorRole, payload: { workItemId: workItem.workItemId, status: workItem.status, executionQueueCount: executionQueueCount(state) } }));
  appendEvent(state, makeEvent({ eventType: "COMMAND_CENTER_CASEWORK_UPDATED", aggregateType: "COMMAND_STATE", aggregateId: "GLOBAL", actorId, actorRole, payload: { workItemCount: state.workItems.length, executionQueueCount: executionQueueCount(state) } }));
  writeState(state);
  return created("WORK_ITEM_CREATED", { item: workItem, eventCount: state.events.length });
}

function transitionWorkItem(workItemId, headers, action, toStatus) {
  const actorId = String(headers["x-actor-id"] || "").trim();
  const actorRole = String(headers["x-actor-role"] || "").trim();
  const state = readState();
  const item = state.workItems.find((i) => i.workItemId === workItemId);
  if (!item) return rejected(404, "WORK_ITEM_NOT_FOUND", [{ field: "workItemId", message: "Work item not found" }]);
  if (actorRole !== "board_operator") return rejected(403, "WORK_ITEM_TRANSITION_FORBIDDEN", [{ field: "x-actor-role", message: "Only board_operator may execute lifecycle transitions" }]);
  if (!actorId) return rejected(422, "WORK_ITEM_TRANSITION_INVALID", [{ field: "x-actor-id", message: "x-actor-id is required" }]);
  const allowed = (
    (action === "start" && item.status === "READY" && toStatus === "IN_PROGRESS") ||
    (action === "complete" && item.status === "IN_PROGRESS" && toStatus === "COMPLETED") ||
    (action === "block" && (item.status === "READY" || item.status === "IN_PROGRESS") && toStatus === "BLOCKED")
  );
  if (!allowed) return rejected(422, "WORK_ITEM_TRANSITION_INVALID", [{ field: "status", message: `Transition ${item.status} -> ${toStatus} is not allowed` }]);
  const fromStatus = item.status;
  item.status = toStatus;
  item.updatedAt = nowIso();
  const transition = { transitionId: id("transition"), workItemId, action, fromStatus, toStatus, actorId, actorRole, occurredAt: nowIso() };
  state.workItemTransitions.push(transition);
  const eventType = action === "start" ? "WORK_ITEM_STARTED" : action === "block" ? "WORK_ITEM_BLOCKED" : "WORK_ITEM_COMPLETED";
  appendEvent(state, makeEvent({ eventType, aggregateType: "WORK_ITEM", aggregateId: workItemId, actorId, actorRole, payload: { workItemId, fromStatus, toStatus } }));
  appendEvent(state, makeEvent({ eventType: "EXECUTION_QUEUE_UPDATED", aggregateType: "EXECUTION_QUEUE", aggregateId: "GLOBAL", actorId, actorRole, payload: { workItemId, status: item.status, executionQueueCount: executionQueueCount(state) } }));
  appendEvent(state, makeEvent({ eventType: "EXECUTION_PROGRESS_UPDATED", aggregateType: "COMMAND_STATE", aggregateId: "GLOBAL", actorId, actorRole, payload: { workItemId, completedWorkItemCount: state.workItems.filter((i) => i.status === "COMPLETED").length, executionQueueCount: executionQueueCount(state) } }));
  writeState(state);
  return ok("WORK_ITEM_TRANSITION_EXECUTED", { item, transition, eventCount: state.events.length });
}

function startWorkItem(workItemId, headers) { return transitionWorkItem(workItemId, headers, "start", "IN_PROGRESS"); }
function blockWorkItem(workItemId, headers) { return transitionWorkItem(workItemId, headers, "block", "BLOCKED"); }
function completeWorkItem(workItemId, headers) { return transitionWorkItem(workItemId, headers, "complete", "COMPLETED"); }

function createDeliveryArtifact(workItemId, input, headers) {
  const actorId = String(headers["x-actor-id"] || "").trim();
  const actorRole = String(headers["x-actor-role"] || "").trim();
  const state = readState();
  const workItem = state.workItems.find((i) => i.workItemId === workItemId);
  if (!workItem) return rejected(404, "WORK_ITEM_NOT_FOUND", [{ field: "workItemId", message: "Work item not found" }]);
  if (workItem.status !== "COMPLETED") return rejected(422, "DELIVERY_ARTIFACT_INVALID", [{ field: "status", message: "Delivery artifact creation allowed only in COMPLETED" }]);
  if (actorRole !== "board_operator") return rejected(403, "DELIVERY_ARTIFACT_FORBIDDEN", [{ field: "x-actor-role", message: "Only board_operator may create delivery artifacts" }]);
  const deliveryArtifact = {
    deliveryArtifactId: id("delivery"),
    workItemId,
    opportunityId: workItem.opportunityId,
    title: String((input && input.title) || "").trim(),
    summary: String((input && input.summary) || "").trim(),
    artifactType: String((input && input.artifactType) || "").trim(),
    evidenceState: "EVIDENCE_CAPTURED",
    reviewState: "DELIVERY_VISIBLE",
    actorId,
    actorRole,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  state.deliveryArtifacts.push(deliveryArtifact);
  appendEvent(state, makeEvent({ eventType: "DELIVERY_ARTIFACT_CREATED", aggregateType: "DELIVERY_ARTIFACT", aggregateId: deliveryArtifact.deliveryArtifactId, actorId, actorRole, payload: { deliveryArtifactId: deliveryArtifact.deliveryArtifactId, workItemId, opportunityId: workItem.opportunityId } }));
  appendEvent(state, makeEvent({ eventType: "DELIVERY_EVIDENCE_UPDATED", aggregateType: "DELIVERY_EVIDENCE", aggregateId: workItemId, actorId, actorRole, payload: { workItemId, deliveryArtifactCount: state.deliveryArtifacts.filter((i) => i.workItemId === workItemId).length } }));
  appendEvent(state, makeEvent({ eventType: "COMMAND_CENTER_DELIVERY_UPDATED", aggregateType: "COMMAND_STATE", aggregateId: "GLOBAL", actorId, actorRole, payload: { deliveryArtifactCount: state.deliveryArtifacts.length, completedWorkItemCount: state.workItems.filter((i) => i.status === "COMPLETED").length } }));
  writeState(state);
  return created("DELIVERY_ARTIFACT_CREATED", { item: deliveryArtifact, eventCount: state.events.length });
}

function createEvidencePack(deliveryArtifactId, input, headers) {
  const actorId = String(headers["x-actor-id"] || "").trim();
  const actorRole = String(headers["x-actor-role"] || "").trim();
  const title = String((input && input.title) || "").trim();
  const summary = String((input && input.summary) || "").trim();
  const packType = String((input && input.packType) || "").trim();
  const state = readState();
  const da = state.deliveryArtifacts.find((i) => i.deliveryArtifactId === deliveryArtifactId);
  if (!da) return rejected(404, "DELIVERY_ARTIFACT_NOT_FOUND", [{ field: "deliveryArtifactId", message: "Delivery artifact not found" }]);
  if (!canCreateEvidencePack(actorRole)) return rejected(403, "EVIDENCE_PACK_FORBIDDEN", [{ field: "x-actor-role", message: "Only board_operator may create evidence packs" }]);
  const missing = [];
  if (!actorId) missing.push("x-actor-id");
  if (!title) missing.push("title");
  if (!summary) missing.push("summary");
  if (!packType) missing.push("packType");
  if (missing.length > 0) return rejected(422, "EVIDENCE_PACK_INVALID", [{ field: "payload", message: "Missing required fields", fields: missing }]);

  const evidencePack = {
    evidencePackId: id("evidencepack"),
    deliveryArtifactId,
    workItemId: da.workItemId,
    opportunityId: da.opportunityId,
    title,
    summary,
    packType,
    trustState: initialTrustState(),
    exportState: initialExportState(),
    actorId,
    actorRole,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  state.evidencePacks.push(evidencePack);
  appendEvent(state, makeEvent({ eventType: "EVIDENCE_PACK_CREATED", aggregateType: "EVIDENCE_PACK", aggregateId: evidencePack.evidencePackId, actorId, actorRole, payload: { evidencePackId: evidencePack.evidencePackId, deliveryArtifactId, workItemId: da.workItemId } }));
  appendEvent(state, makeEvent({ eventType: "TRUST_CLOSURE_UPDATED", aggregateType: "TRUST_CLOSURE", aggregateId: da.workItemId, actorId, actorRole, payload: { workItemId: da.workItemId, evidencePackCount: state.evidencePacks.filter((i) => i.deliveryArtifactId === deliveryArtifactId).length } }));
  appendEvent(state, makeEvent({ eventType: "COMMAND_CENTER_TRUST_UPDATED", aggregateType: "COMMAND_STATE", aggregateId: "GLOBAL", actorId, actorRole, payload: { evidencePackCount: state.evidencePacks.length, deliveryArtifactCount: state.deliveryArtifacts.length } }));
  writeState(state);
  return created("EVIDENCE_PACK_CREATED", { item: evidencePack, evidencePackCount: state.evidencePacks.length, eventCount: state.events.length });
}

module.exports = {
  getCommandCenterState, getOpportunities, getOpportunityById, getDecisionAudit,
  getBoardQueue, getEvents, getWorkItemsForOpportunity, getWorkItems, getWorkItemById,
  getExecutionQueue, getDeliveryArtifactsForWorkItem, getDeliveryArtifacts, getDeliveryArtifactById,
  getEvidencePacksForDeliveryArtifact, getEvidencePacks, getEvidencePackById,
  createIntake, advanceOpportunityStage, approveOpportunity, rejectOpportunity,
  createWorkItem, startWorkItem, blockWorkItem, completeWorkItem, createDeliveryArtifact, createEvidencePack
};
