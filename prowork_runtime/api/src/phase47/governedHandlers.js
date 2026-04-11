const { readState, writeState, id, nowIso } = require("./governedStore");
const { makeEvent } = require("./eventEnvelope");
const { ok, created, rejected } = require("./response");
const { canCreateWorkItem, requiredOpportunityStage, executionVisibleStatuses } = require("./authz");

function appendEvent(state, event) {
  state.events.push(event);
}

function getCommandCenterState() {
  const state = readState();
  const approvedCount = state.opportunities.filter((item) => item.stage === "APPROVED").length;
  const rejectedCount = state.opportunities.filter((item) => item.stage === "REJECTED").length;

  return ok("COMMAND_CENTER_STATE_FETCHED", {
    summary: {
      intakeCount: state.intakes.length,
      opportunityCount: state.opportunities.length,
      approvalCount: state.approvals.length,
      approvedCount,
      rejectedCount,
      workItemCount: state.workItems.length,
      eventCount: state.events.length
    },
    latestOpportunity: state.opportunities[state.opportunities.length - 1] || null,
    updatedAt: state.updatedAt
  });
}

function getOpportunities() {
  const state = readState();
  return ok("OPPORTUNITY_LIST_FETCHED", {
    items: state.opportunities,
    count: state.opportunities.length,
    updatedAt: state.updatedAt
  });
}

function getOpportunityById(opportunityId) {
  const state = readState();
  const opportunity = state.opportunities.find((item) => item.opportunityId === opportunityId);

  if (!opportunity) {
    return rejected(404, "OPPORTUNITY_NOT_FOUND", [
      { field: "opportunityId", message: "Opportunity not found" }
    ]);
  }

  return ok("OPPORTUNITY_DETAIL_FETCHED", {
    item: opportunity,
    updatedAt: state.updatedAt
  });
}

function getBoardQueue() {
  const state = readState();
  const items = state.opportunities.filter((item) => item.stage === "BOARD_REVIEW");
  return ok("BOARD_QUEUE_FETCHED", {
    items,
    count: items.length,
    updatedAt: state.updatedAt
  });
}

function getEvents() {
  const state = readState();
  return ok("EVENTS_FETCHED", {
    items: state.events,
    count: state.events.length,
    updatedAt: state.updatedAt
  });
}

function createIntake(input) {
  const missing = ["tenantId", "requesterId", "title", "summary"].filter((key) => {
    return !input || typeof input[key] !== "string" || input[key].trim() === "";
  });

  if (missing.length > 0) {
    return rejected(422, "INTAKE_INVALID", [
      { message: "Missing required fields", fields: missing }
    ]);
  }

  if (input.title.trim().length < 3) {
    return rejected(422, "INTAKE_INVALID", [
      { field: "title", message: "title must be at least 3 characters" }
    ]);
  }

  if (input.summary.trim().length < 10) {
    return rejected(422, "INTAKE_INVALID", [
      { field: "summary", message: "summary must be at least 10 characters" }
    ]);
  }

  const state = readState();

  const intake = {
    intakeId: id("intake"),
    tenantId: input.tenantId.trim(),
    requesterId: input.requesterId.trim(),
    title: input.title.trim(),
    summary: input.summary.trim(),
    createdAt: nowIso(),
    status: "INTAKE_ACCEPTED"
  };

  const opportunity = {
    opportunityId: id("opp"),
    intakeId: intake.intakeId,
    tenantId: intake.tenantId,
    title: intake.title,
    summary: intake.summary,
    stage: "COMMAND_VISIBLE",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  state.intakes.push(intake);
  state.opportunities.push(opportunity);

  appendEvent(state, makeEvent({
    eventType: "INTAKE_CREATED",
    aggregateType: "INTAKE",
    aggregateId: intake.intakeId,
    actorId: intake.requesterId,
    actorRole: "requester",
    payload: { intakeId: intake.intakeId, tenantId: intake.tenantId }
  }));

  appendEvent(state, makeEvent({
    eventType: "OPPORTUNITY_REGISTERED",
    aggregateType: "OPPORTUNITY",
    aggregateId: opportunity.opportunityId,
    actorId: intake.requesterId,
    actorRole: "requester",
    payload: { opportunityId: opportunity.opportunityId, intakeId: intake.intakeId }
  }));

  appendEvent(state, makeEvent({
    eventType: "COMMAND_CENTER_STATE_UPDATED",
    aggregateType: "COMMAND_STATE",
    aggregateId: "GLOBAL",
    actorId: "system",
    actorRole: "system_viewer",
    payload: {
      intakeCount: state.intakes.length,
      opportunityCount: state.opportunities.length
    }
  }));

  writeState(state);

  return created("INTAKE_CREATED", {
    intake,
    opportunity,
    commandCenter: {
      intakeCount: state.intakes.length,
      opportunityCount: state.opportunities.length,
      eventCount: state.events.length
    }
  });
}

function advanceOpportunityStage(opportunityId, input, headers) {
  const actorId = String(headers["x-actor-id"] || "").trim();
  const actorRole = String(headers["x-actor-role"] || "").trim();
  const toStage = String((input && input.toStage) || "").trim();

  if (actorRole !== "board_operator") {
    return rejected(403, "ADVANCE_FORBIDDEN", [
      { field: "x-actor-role", message: "Only board_operator may advance opportunity stage" }
    ]);
  }

  const state = readState();
  const opportunity = state.opportunities.find((item) => item.opportunityId === opportunityId);

  if (!opportunity) {
    return rejected(404, "OPPORTUNITY_NOT_FOUND", [
      { field: "opportunityId", message: "Opportunity not found" }
    ]);
  }

  if (!toStage) {
    return rejected(422, "STAGE_INVALID", [
      { field: "toStage", message: "toStage is required" }
    ]);
  }

  if (!(opportunity.stage === "COMMAND_VISIBLE" && toStage === "BOARD_REVIEW")) {
    return rejected(422, "STAGE_INVALID", [
      { field: "toStage", message: `Transition ${opportunity.stage} -> ${toStage} is not allowed` }
    ]);
  }

  const fromStage = opportunity.stage;
  opportunity.stage = toStage;
  opportunity.updatedAt = nowIso();
  opportunity.lastTransition = {
    actorId,
    actorRole,
    fromStage,
    toStage,
    at: nowIso()
  };

  appendEvent(state, makeEvent({
    eventType: "OPPORTUNITY_STAGE_ADVANCED",
    aggregateType: "OPPORTUNITY",
    aggregateId: opportunity.opportunityId,
    actorId: actorId || "unknown",
    actorRole,
    payload: {
      opportunityId: opportunity.opportunityId,
      fromStage,
      toStage
    }
  }));

  appendEvent(state, makeEvent({
    eventType: "BOARD_QUEUE_STATE_UPDATED",
    aggregateType: "BOARD_QUEUE",
    aggregateId: "GLOBAL",
    actorId: actorId || "unknown",
    actorRole,
    payload: {
      opportunityId: opportunity.opportunityId,
      stage: opportunity.stage
    }
  }));

  writeState(state);

  return ok("OPPORTUNITY_STAGE_ADVANCED", {
    item: opportunity,
    boardQueueCount: state.opportunities.filter((item) => item.stage === "BOARD_REVIEW").length,
    eventCount: state.events.length
  });
}

function approveOpportunity(opportunityId, input, headers) {
  const actorId = String(headers["x-actor-id"] || "").trim();
  const actorRole = String(headers["x-actor-role"] || "").trim();
  const reason = String((input && input.reason) || "").trim();
  const state = readState();
  const opportunity = state.opportunities.find((item) => item.opportunityId === opportunityId);

  if (!opportunity) {
    return rejected(404, "OPPORTUNITY_NOT_FOUND", [
      { field: "opportunityId", message: "Opportunity not found" }
    ]);
  }

  if (!canCreateWorkItem(actorRole) && actorRole !== "board_operator") {
    return rejected(403, "DECISION_FORBIDDEN", [
      { field: "x-actor-role", message: "Only board_operator may approve" }
    ]);
  }

  if (actorRole !== "board_operator") {
    return rejected(403, "DECISION_FORBIDDEN", [
      { field: "x-actor-role", message: "Only board_operator may approve" }
    ]);
  }

  if (!actorId) {
    return rejected(422, "DECISION_INVALID", [
      { field: "x-actor-id", message: "x-actor-id is required" }
    ]);
  }

  if (!reason) {
    return rejected(422, "DECISION_INVALID", [
      { field: "reason", message: "reason is required" }
    ]);
  }

  if (opportunity.stage !== "BOARD_REVIEW") {
    return rejected(422, "DECISION_INVALID", [
      { field: "stage", message: "Decision allowed only in BOARD_REVIEW" }
    ]);
  }

  const approval = {
    approvalId: id("approval"),
    opportunityId,
    decisionType: "APPROVE",
    actorId,
    actorRole,
    reason,
    createdAt: nowIso()
  };

  state.approvals.push(approval);

  appendEvent(state, makeEvent({
    eventType: "APPROVAL_RECORDED",
    aggregateType: "APPROVAL",
    aggregateId: approval.approvalId,
    actorId,
    actorRole,
    payload: {
      approvalId: approval.approvalId,
      opportunityId,
      decisionType: "APPROVE"
    }
  }));

  opportunity.stage = "APPROVED";
  opportunity.updatedAt = nowIso();
  opportunity.finalDecision = {
    approvalId: approval.approvalId,
    decisionType: "APPROVE",
    actorId,
    actorRole,
    reason,
    at: nowIso()
  };

  appendEvent(state, makeEvent({
    eventType: "OPPORTUNITY_APPROVED",
    aggregateType: "OPPORTUNITY",
    aggregateId: opportunityId,
    actorId,
    actorRole,
    payload: {
      opportunityId,
      approvalId: approval.approvalId,
      finalStage: "APPROVED"
    }
  }));

  writeState(state);

  return ok("OPPORTUNITY_APPROVED", {
    item: opportunity,
    approval,
    eventCount: state.events.length
  });
}

function createWorkItem(opportunityId, input, headers) {
  const actorId = String(headers["x-actor-id"] || "").trim();
  const actorRole = String(headers["x-actor-role"] || "").trim();

  if (!canCreateWorkItem(actorRole)) {
    return rejected(403, "WORK_ITEM_FORBIDDEN", [
      { field: "x-actor-role", message: "Only board_operator may create work items" }
    ]);
  }

  const state = readState();
  const opportunity = state.opportunities.find((item) => item.opportunityId === opportunityId);

  if (!opportunity) {
    return rejected(404, "OPPORTUNITY_NOT_FOUND", [
      { field: "opportunityId", message: "Opportunity not found" }
    ]);
  }

  if (opportunity.stage !== requiredOpportunityStage()) {
    return rejected(422, "WORK_ITEM_BLOCKED", [
      {
        field: "stage",
        message: `Work item creation requires opportunity stage ${requiredOpportunityStage()}, current: ${opportunity.stage}`
      }
    ]);
  }

  const missing = ["title", "summary"].filter((key) => {
    return !input || typeof input[key] !== "string" || input[key].trim() === "";
  });

  if (missing.length > 0) {
    return rejected(422, "WORK_ITEM_INVALID", [
      { message: "Missing required fields", fields: missing }
    ]);
  }

  const workItem = {
    workItemId: id("wi"),
    opportunityId,
    title: input.title.trim(),
    summary: input.summary.trim(),
    status: "READY",
    queueState: "EXECUTION_VISIBLE",
    actorId,
    actorRole,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  state.workItems.push(workItem);

  appendEvent(state, makeEvent({
    eventType: "WORK_ITEM_CREATED",
    aggregateType: "WORK_ITEM",
    aggregateId: workItem.workItemId,
    actorId,
    actorRole,
    payload: {
      workItemId: workItem.workItemId,
      opportunityId,
      status: workItem.status,
      queueState: workItem.queueState
    }
  }));

  appendEvent(state, makeEvent({
    eventType: "EXECUTION_QUEUE_UPDATED",
    aggregateType: "EXECUTION_QUEUE",
    aggregateId: "GLOBAL",
    actorId,
    actorRole,
    payload: {
      workItemId: workItem.workItemId,
      queueState: workItem.queueState,
      executionQueueCount: state.workItems.filter((wi) =>
        executionVisibleStatuses().includes(wi.status)
      ).length
    }
  }));

  appendEvent(state, makeEvent({
    eventType: "CASEWORK_ACTIVATION_CONFIRMED",
    aggregateType: "CASEWORK",
    aggregateId: workItem.workItemId,
    actorId: "system",
    actorRole: "system_viewer",
    payload: {
      workItemId: workItem.workItemId,
      opportunityId,
      status: workItem.status,
      activatedAt: workItem.createdAt
    }
  }));

  writeState(state);

  return created("WORK_ITEM_CREATED", {
    item: workItem,
    executionQueueCount: state.workItems.filter((wi) =>
      executionVisibleStatuses().includes(wi.status)
    ).length,
    eventCount: state.events.length
  });
}

function getWorkItemsByOpportunity(opportunityId) {
  const state = readState();
  const opportunity = state.opportunities.find((item) => item.opportunityId === opportunityId);

  if (!opportunity) {
    return rejected(404, "OPPORTUNITY_NOT_FOUND", [
      { field: "opportunityId", message: "Opportunity not found" }
    ]);
  }

  const items = state.workItems.filter((wi) => wi.opportunityId === opportunityId);
  return ok("WORK_ITEM_LIST_FETCHED", {
    opportunityId,
    items,
    count: items.length,
    updatedAt: state.updatedAt
  });
}

function getAllWorkItems() {
  const state = readState();
  return ok("WORK_ITEM_LIST_FETCHED", {
    items: state.workItems,
    count: state.workItems.length,
    updatedAt: state.updatedAt
  });
}

function getWorkItemById(workItemId) {
  const state = readState();
  const workItem = state.workItems.find((wi) => wi.workItemId === workItemId);

  if (!workItem) {
    return rejected(404, "WORK_ITEM_NOT_FOUND", [
      { field: "workItemId", message: "Work item not found" }
    ]);
  }

  return ok("WORK_ITEM_DETAIL_FETCHED", {
    item: workItem,
    updatedAt: state.updatedAt
  });
}

function getExecutionQueue() {
  const state = readState();
  const visibleStatuses = executionVisibleStatuses();
  const items = state.workItems.filter((wi) => visibleStatuses.includes(wi.status));
  return ok("EXECUTION_QUEUE_FETCHED", {
    items,
    count: items.length,
    visibleStatuses,
    updatedAt: state.updatedAt
  });
}

module.exports = {
  getCommandCenterState,
  getOpportunities,
  getOpportunityById,
  getBoardQueue,
  getEvents,
  createIntake,
  advanceOpportunityStage,
  approveOpportunity,
  createWorkItem,
  getWorkItemsByOpportunity,
  getAllWorkItems,
  getWorkItemById,
  getExecutionQueue
};
