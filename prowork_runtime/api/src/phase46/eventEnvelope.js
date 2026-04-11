const { id, nowIso } = require("./governedStore");

function makeEvent({ eventType, aggregateType, aggregateId, actorId, actorRole, payload }) {
  return {
    eventId: id("evt"),
    eventType,
    eventVersion: "1.0",
    occurredAt: nowIso(),
    aggregateType,
    aggregateId,
    actor: {
      actorId,
      actorRole
    },
    payload
  };
}

module.exports = {
  makeEvent
};
