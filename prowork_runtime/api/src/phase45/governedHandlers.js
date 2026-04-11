const { readState, writeState, id, nowIso } = require("./governedStore");
const { makeEvent } = require("./eventEnvelope");
const { ok, created, rejected } = require("./response");
const { canAdvance, isAllowedTransition } = require("./authz");

function appendEvent(state, event) {
  state.events.push(event);
}

function getCommandCenterState() {
  const state = readState();
  return ok("COMMAND_CENTER_STATE_FETCHED", {
    summary: {
      intakeCount: state.intakes.length,
      opportunityCount: state.opportunities.length,
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
  const items = state.opportunities.filter((item) => {
    return item.stage === "BOARD_REVIEW" || item.stage === "APPROVED";
  });

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

  if (!canAdvance(actorRole)) {
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

  if (!isAllowedTransition(opportunity.stage, toStage)) {
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
    boardQueueCount: state.opportunities.filter((item) => {
      return item.stage === "BOARD_REVIEW" || item.stage === "APPROVED";
    }).length,
    eventCount: state.events.length
  });
}

module.exports = {
  getCommandCenterState,
  getOpportunities,
  getOpportunityById,
  getBoardQueue,
  getEvents,
  createIntake,
  advanceOpportunityStage
};
