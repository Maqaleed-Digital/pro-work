const { readState, writeState, id, nowIso } = require("./governedStore");

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body, null, 2)
  };
}

function appendEvent(state, eventType, aggregateType, aggregateId, payload) {
  state.events.push({
    eventId: id("evt"),
    eventType,
    eventVersion: "1.0",
    occurredAt: nowIso(),
    aggregateType,
    aggregateId,
    payload
  });
}

function getCommandCenterState() {
  const state = readState();
  return json(200, {
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
  return json(200, {
    items: state.opportunities,
    count: state.opportunities.length,
    updatedAt: state.updatedAt
  });
}

function createIntake(input) {
  const missing = ["tenantId", "requesterId", "title", "summary"].filter((key) => {
    return !input || typeof input[key] !== "string" || input[key].trim() === "";
  });

  if (missing.length > 0) {
    return json(422, {
      error: "INTAKE_INVALID",
      reason: "Missing required fields",
      missing
    });
  }

  if (input.title.trim().length < 3) {
    return json(422, {
      error: "INTAKE_INVALID",
      reason: "title must be at least 3 characters"
    });
  }

  if (input.summary.trim().length < 10) {
    return json(422, {
      error: "INTAKE_INVALID",
      reason: "summary must be at least 10 characters"
    });
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
    createdAt: nowIso()
  };

  state.intakes.push(intake);
  appendEvent(state, "INTAKE_CREATED", "INTAKE", intake.intakeId, {
    intakeId: intake.intakeId,
    tenantId: intake.tenantId
  });

  state.opportunities.push(opportunity);
  appendEvent(state, "OPPORTUNITY_REGISTERED", "OPPORTUNITY", opportunity.opportunityId, {
    opportunityId: opportunity.opportunityId,
    intakeId: intake.intakeId
  });

  appendEvent(state, "COMMAND_CENTER_STATE_UPDATED", "COMMAND_STATE", "GLOBAL", {
    intakeCount: state.intakes.length,
    opportunityCount: state.opportunities.length
  });

  writeState(state);

  return json(201, {
    intake,
    opportunity,
    commandCenter: {
      intakeCount: state.intakes.length,
      opportunityCount: state.opportunities.length,
      eventCount: state.events.length
    }
  });
}

module.exports = {
  getCommandCenterState,
  getOpportunities,
  createIntake
};
