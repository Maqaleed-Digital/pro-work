const test = require("node:test")
const assert = require("node:assert")

const spec = require("../../app/modules/protocol/identity_protocol_spec")
const validate = require("../../app/modules/protocol/credential_format")
const resolve = require("../../app/modules/protocol/global_identity_resolver")
const gateway = require("../../app/modules/protocol/trust_protocol_gateway")
const federate = require("../../app/modules/protocol/identity_federation_bridge")

test("protocol spec exposes namespace", () => {
  const result = spec.getSpec()
  assert.equal(result.namespace, "prowork.identity")
})

test("credential format validator returns valid", () => {
  const result = validate({ credential_id: "cred1" })
  assert.equal(result.valid, true)
})

test("global identity resolver resolves id", () => {
  const result = resolve("id123")
  assert.equal(result.resolved, true)
})

test("protocol gateway executes request", () => {
  const result = gateway("nodeA", { a:1 })
  assert.equal(result.target, "nodeA")
})

test("identity federation bridge federates", () => {
  const result = federate("id123", "fabricA")
  assert.equal(result.federated, true)
})
