const { readState, writeState, id, nowIso } = require("./governedStore");
const { makeEvent } = require("./eventEnvelope");
const { ok, created, rejected } = require("./response");
const { canStart, canBlock, canComplete, isAllowedTransition, executionVisibleStatuses } = require("./authz");

function appendEvent(state, event) {
  state.events.push(event);
}

function queueCount(state) {
  return state.workItems.filter((item) => executionVisibleStatuses().includes(item.status)).length;
}

function getCommandCenterState() {
  const state = readState();
  return ok("COMMAND_CENTER_STATE_FETCHED", {
    summary: {
      intakeCount: state.intakes.length,
      opportunityCount: state.opportunities.length,
      approvalCount: state.approvals.length,
      workItemCount: state.workItems.length,
      executionQueueCount: queueCount(state),
      completedWorkItemCount: state.workItems.filter((i) => i.status === "COMPLETED").length,
      blockedWorkItemCount: state.workItems.filter((i) => i.status === "BLOCKED").length,
      approvedCount: state.opportunities.filter((i) => i.stage === "APPROVED").length,
      rejectedCount: state.opportunities.filter((i) => i.stage === "REJECTED").length,
      eventCount: state.events.length
    },
    latestOpportunity: state.opportunities[state.opportunities.length - 1] || null,
    latestWorkItem: state.workItems[state.workItems.length - 1] || null,
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
  const opportunity = state.opportunities.find((i) => i.opportunityId === opportunityId);
  if (!opportunity) {
    return rejected(404, "OPPORTUNITY_NOT_FOUND", [{ field: "opportunityId", message: "Opportunity not found" }]);
  }
  return ok("OPPORTUNITY_DETAIL_FETCHED", { item: opportunity, updatedAt: state.updatedAt });
}

function getDecisionAudit(opportunityId) {
  const state = readState();
  const opportunity = state.opportunities.find((i) => i.opportunityId === opportunityId);
  if (!opportunity) {
    return rejected(404, "OPPORTUNITY_NOT_FOUND", [{ field: "opportunityId", message: "Opportunity not found" }]);
  }
  const items = state.approvals
    .filter((i) => i.opportunityId === opportunityId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
  const opportunity = state.opportunities.find((i) => i.opportunityId === opportunityId);
  if (!opportunity) {
    return rejected(404, "OPPORTUNITY_NOT_FOUND", [{ field: "opportunityId", message: "Opportunity not found" }]);
  }
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
  if (!item) {
    return rejected(404, "WORK_ITEM_NOT_FOUND", [{ field: "workItemId", message: "Work item not found" }]);
  }
  const transitions = state.workItemTransitions.filter((t) => t.workItemId === workItemId);
  return ok("WORK_ITEM_DETAIL_FETCHED", { item, transitions, updatedAt: state.updatedAt });
}

function getExecutionQueue() {
  const state = readState();
  const items = state.workItems.filter((i) => executionVisibleStatuses().includes(i.status));
  return ok("EXECUTION_QUEUE_FETCHED", {
    items,
    count: items.length,
    visibleStatuses: executionVisibleStatuses(),
    updatedAt: state.updatedAt
  });
}

function createIntake(input) {
  const missing = ["tenantId", "requesterId", "title", "summary"].filter((key) => {
    return !input || typeof input[key] !== "string" || input[key].trim() === "";
  });
  if (missing.length > 0) {
    return rejected(422, "INTAKE_INVALID", [{ message: "Missing required fields", fields: missing }]);
  }
  if (input.title.trim().length < 3) {
    return rejected(422, "INTAKE_INVALID", [{ field: "title", message: "title must be at least 3 characters" }]);
  }
  if (input.summary.trim().length < 10) {
    return rejected(422, "INTAKE_INVALID", [{ field: "summary", message: "summary must be at least 10 characters" }]);
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

  appendEvent(state, makeEvent({ eventType: "INTAKE_CREATED", aggregateType: "INTAKE", aggregateId: intake.intakeId, actorId: intake.requesterId, actorRole: "requester", payload: { intakeId: intake.intakeId, tenantId: intake.tenantId } }));
  appendEvent(state, makeEvent({ eventType: "OPPORTUNITY_REGISTERED", aggregateType: "OPPORTUNITY", aggregateId: opportunity.opportunityId, actorId: intake.requesterId, actorRole: "requester", payload: { opportunityId: opportunity.opportunityId, intakeId: intake.intakeId } }));
  appendEvent(state, makeEvent({ eventType: "COMMAND_CENTER_STATE_UPDATED", aggregateType: "COMMAND_STATE", aggregateId: "GLOBAL", actorId: "system", actorRole: "system_viewer", payload: { intakeCount: state.intakes.length, opportunityCount: state.opportunities.length } }));

  writeState(state);

  return created("INTAKE_CREATED", {
    intake,
    opportunity,
    commandCenter: { intakeCount: state.intakes.length, opportunityCount: state.opportunities.length, eventCount: state.events.length }
  });
}

function advanceOpportunityStage(opportunityId, input, headers) {
  const actorId = String(headers["x-actor-id"] || "").trim();
  const actorRole = String(headers["x-actor-role"] || "").trim();
  const toStage = String((input && input.toStage) || "").trim();

  if (actorRole !== "board_operator") {
    return rejected(403, "ADVANCE_FORBIDDEN", [{ field: "x-actor-role", message: "Only board_operator may advance opportunity stage" }]);
  }

  const state = readState();
  const opportunity = state.opportunities.find((i) => i.opportunityId === opportunityId);
  if (!opportunity) {
    return rejected(404, "OPPORTUNITY_NOT_FOUND", [{ field: "opportunityId", message: "Opportunity not found" }]);
  }

  if (!(opportunity.stage === "COMMAND_VISIBLE" && toStage === "BOARD_REVIEW")) {
    return rejected(422, "STAGE_INVALID", [{ field: "toStage", message: `Transition ${opportunity.stage} -> ${toStage} is not allowed` }]);
  }

  const fromStage = opportunity.stage;
  opportunity.stage = toStage;
  opportunity.updatedAt = nowIso();

  appendEvent(state, makeEvent({ eventType: "OPPORTUNITY_STAGE_ADVANCED", aggregateType: "OPPORTUNITY", aggregateId: opportunity.opportunityId, actorId, actorRole, payload: { opportunityId: opportunity.opportunityId, fromStage, toStage } }));
  appendEvent(state, makeEvent({ eventType: "BOARD_QUEUE_STATE_UPDATED", aggregateType: "BOARD_QUEUE", aggregateId: "GLOBAL", actorId, actorRole, payload: { opportunityId: opportunity.opportunityId, stage: opportunity.stage } }));

  writeState(state);

  return ok("OPPORTUNITY_STAGE_ADVANCED", {
    item: opportunity,
    boardQueueCount: state.opportunities.filter((i) => i.stage === "BOARD_REVIEW").length,
    eventCount: state.events.length
  });
}

function decisionForOpportunity(opportunityId, input, headers, decisionType) {
  const actorId = String(headers["x-actor-id"] || "").trim();
  const actorRole = String(headers["x-actor-role"] || "").trim();
  const reason = String((input && input.reason) || "").trim();
  const state = readState();
  const opportunity = state.opportunities.find((i) => i.opportunityId === opportunityId);

  if (!opportunity) {
    return rejected(404, "OPPORTUNITY_NOT_FOUND", [{ field: "opportunityId", message: "Opportunity not found" }]);
  }
  if (actorRole !== "board_operator") {
    return rejected(403, "DECISION_FORBIDDEN", [{ field: "x-actor-role", message: "Only board_operator may make final decisions" }]);
  }
  if (opportunity.stage !== "BOARD_REVIEW") {
    return rejected(422, "DECISION_INVALID", [{ field: "stage", message: "Decision allowed only in BOARD_REVIEW" }]);
  }

  const finalStage = decisionType === "APPROVE" ? "APPROVED" : "REJECTED";
  const approval = {
    approvalId: id("approval"),
    opportunityId,
    decisionType,
    actorId,
    actorRole,
    reason,
    createdAt: nowIso()
  };
  state.approvals.push(approval);

  appendEvent(state, makeEvent({ eventType: "APPROVAL_RECORDED", aggregateType: "APPROVAL", aggregateId: approval.approvalId, actorId, actorRole, payload: { approvalId: approval.approvalId, opportunityId, decisionType } }));

  opportunity.stage = finalStage;
  opportunity.updatedAt = nowIso();
  opportunity.finalDecision = { approvalId: approval.approvalId, decisionType, actorId, actorRole, reason, at: nowIso() };

  appendEvent(state, makeEvent({ eventType: decisionType === "APPROVE" ? "OPPORTUNITY_APPROVED" : "OPPORTUNITY_REJECTED", aggregateType: "OPPORTUNITY", aggregateId: opportunityId, actorId, actorRole, payload: { opportunityId, approvalId: approval.approvalId, finalStage } }));
  appendEvent(state, makeEvent({ eventType: "DECISION_AUDIT_UPDATED", aggregateType: "DECISION_AUDIT", aggregateId: opportunityId, actorId, actorRole, payload: { opportunityId, decisionCount: state.approvals.filter((i) => i.opportunityId === opportunityId).length } }));

  writeState(state);

  return ok(decisionType === "APPROVE" ? "OPPORTUNITY_APPROVED" : "OPPORTUNITY_REJECTED", {
    item: opportunity,
    approval,
    boardQueueCount: state.opportunities.filter((i) => i.stage === "BOARD_REVIEW").length,
    eventCount: state.events.length
  });
}

function approveOpportunity(opportunityId, input, headers) {
  return decisionForOpportunity(opportunityId, input, headers, "APPROVE");
}

function rejectOpportunity(opportunityId, input, headers) {
  return decisionForOpportunity(opportunityId, input, headers, "REJECT");
}

function createWorkItem(opportunityId, input, headers) {
  const actorId = String(headers["x-actor-id"] || "").trim();
  const actorRole = String(headers["x-actor-role"] || "").trim();
  const title = String((input && input.title) || "").trim();
  const summary = String((input && input.summary) || "").trim();
  const state = readState();
  const opportunity = state.opportunities.find((i) => i.opportunityId === opportunityId);

  if (!opportunity) {
    return rejected(404, "OPPORTUNITY_NOT_FOUND", [{ field: "opportunityId", message: "Opportunity not found" }]);
  }
  if (opportunity.stage !== "APPROVED") {
    return rejected(422, "WORK_ITEM_INVALID", [{ field: "stage", message: "Work item creation allowed only in APPROVED" }]);
  }
  if (actorRole !== "board_operator") {
    return rejected(403, "WORK_ITEM_FORBIDDEN", [{ field: "x-actor-role", message: "Only board_operator may create work items" }]);
  }

  const workItem = {
    workItemId: id("workitem"),
    opportunityId,
    title,
    summary,
    status: "READY",
    queueState: "EXECUTION_VISIBLE",
    actorId,
    actorRole,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  state.workItems.push(workItem);

  appendEvent(state, makeEvent({ eventType: "WORK_ITEM_CREATED", aggregateType: "WORK_ITEM", aggregateId: workItem.workItemId, actorId, actorRole, payload: { workItemId: workItem.workItemId, opportunityId } }));
  appendEvent(state, makeEvent({ eventType: "EXECUTION_QUEUE_UPDATED", aggregateType: "EXECUTION_QUEUE", aggregateId: "GLOBAL", actorId, actorRole, payload: { workItemId: workItem.workItemId, queueState: workItem.queueState, status: workItem.status } }));
  appendEvent(state, makeEvent({ eventType: "COMMAND_CENTER_CASEWORK_UPDATED", aggregateType: "COMMAND_STATE", aggregateId: "GLOBAL", actorId, actorRole, payload: { workItemCount: state.workItems.length, executionQueueCount: queueCount(state) } }));

  writeState(state);

  return created("WORK_ITEM_CREATED", {
    item: workItem,
    executionQueueCount: queueCount(state),
    eventCount: state.events.length
  });
}

function transitionWorkItem(workItemId, headers, action, toStatus, permissionCheck) {
  const actorId = String(headers["x-actor-id"] || "").trim();
  const actorRole = String(headers["x-actor-role"] || "").trim();
  const state = readState();
  const item = state.workItems.find((i) => i.workItemId === workItemId);

  if (!item) {
    return rejected(404, "WORK_ITEM_NOT_FOUND", [{ field: "workItemId", message: "Work item not found" }]);
  }
  if (!permissionCheck(actorRole)) {
    return rejected(403, "WORK_ITEM_TRANSITION_FORBIDDEN", [{ field: "x-actor-role", message: "Only board_operator may execute lifecycle transitions" }]);
  }
  if (!actorId) {
    return rejected(422, "WORK_ITEM_TRANSITION_INVALID", [{ field: "x-actor-id", message: "x-actor-id is required" }]);
  }
  if (!isAllowedTransition(item.status, toStatus)) {
    return rejected(422, "WORK_ITEM_TRANSITION_INVALID", [{ field: "status", message: `Transition ${item.status} -> ${toStatus} is not allowed` }]);
  }

  const fromStatus = item.status;
  item.status = toStatus;
  item.updatedAt = nowIso();
  item.lastAction = action;

  const transition = {
    transitionId: id("transition"),
    workItemId,
    action,
    fromStatus,
    toStatus,
    actorId,
    actorRole,
    occurredAt: nowIso()
  };
  state.workItemTransitions.push(transition);

  const eventType = action === "start" ? "WORK_ITEM_STARTED" : action === "block" ? "WORK_ITEM_BLOCKED" : "WORK_ITEM_COMPLETED";

  appendEvent(state, makeEvent({ eventType, aggregateType: "WORK_ITEM", aggregateId: workItemId, actorId, actorRole, payload: { workItemId, fromStatus, toStatus } }));
  appendEvent(state, makeEvent({ eventType: "EXECUTION_QUEUE_UPDATED", aggregateType: "EXECUTION_QUEUE", aggregateId: "GLOBAL", actorId, actorRole, payload: { workItemId, status: item.status, executionQueueCount: queueCount(state) } }));
  appendEvent(state, makeEvent({ eventType: "EXECUTION_PROGRESS_UPDATED", aggregateType: "COMMAND_STATE", aggregateId: "GLOBAL", actorId, actorRole, payload: { workItemId, completedWorkItemCount: state.workItems.filter((i) => i.status === "COMPLETED").length, blockedWorkItemCount: state.workItems.filter((i) => i.status === "BLOCKED").length, executionQueueCount: queueCount(state) } }));

  writeState(state);

  return ok("WORK_ITEM_TRANSITION_EXECUTED", {
    item,
    transition,
    executionQueueCount: queueCount(state),
    eventCount: state.events.length
  });
}

function startWorkItem(workItemId, headers) {
  return transitionWorkItem(workItemId, headers, "start", "IN_PROGRESS", canStart);
}

function blockWorkItem(workItemId, headers) {
  return transitionWorkItem(workItemId, headers, "block", "BLOCKED", canBlock);
}

function completeWorkItem(workItemId, headers) {
  return transitionWorkItem(workItemId, headers, "complete", "COMPLETED", canComplete);
}

module.exports = {
  getCommandCenterState,
  getOpportunities,
  getOpportunityById,
  getDecisionAudit,
  getBoardQueue,
  getEvents,
  getWorkItemsForOpportunity,
  getWorkItems,
  getWorkItemById,
  getExecutionQueue,
  createIntake,
  advanceOpportunityStage,
  approveOpportunity,
  rejectOpportunity,
  createWorkItem,
  startWorkItem,
  blockWorkItem,
  completeWorkItem
};
