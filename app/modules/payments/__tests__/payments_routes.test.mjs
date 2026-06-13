// WO-WC-HYPERPAY-001 — route handlers with mock adapter + recording repo (no DB/network).
import { test } from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import { makeHandlers } from "../payments_routes.js"
import { createAdapter, __encryptForTest } from "../hyperpay_adapter.js"

function fakeRes() { return { _status: null, _body: null, setHeader() {} } }
function fakeSrv() {
  return {
    ok: (res, data, status = 200) => { res._status = status; res._body = { ok: true, data } },
    fail: (res, code, message, status = 400) => { res._status = status; res._body = { ok: false, error: { code, message } } },
    readJson: async (req) => req.__json,
  }
}
function recordingRepo() {
  const calls = []
  return {
    calls,
    async createTransaction(t) { calls.push(["createTransaction", t]); return { id: "pay_1", ...t } },
    async findByCheckout(id) { calls.push(["findByCheckout", id]); return null },
    async updateTransactionByCheckout(id, p) { calls.push(["updateTransactionByCheckout", id, p]); return { id: "pay_1" } },
    async recordWebhookEvent(e) { calls.push(["recordWebhookEvent", e]); return { id: "whk_1" } },
  }
}
async function* one(buf) { yield buf }
function webhookReq(bodyHex, ivHex, authTagHex) {
  return Object.assign(one(Buffer.from(bodyHex, "utf8")), {
    headers: { "x-initialization-vector": ivHex, "x-authentication-tag": authTagHex },
  })
}

test("POST /checkouts: creates checkout + persists transaction, returns test base", async () => {
  const adapter = createAdapter({ mode: "sandbox", entityId: "E", accessToken: "T" },
    { httpClient: async () => ({ status: 200, json: { id: "chk_1", result: { code: "000.200.100" } } }) })
  const repo = recordingRepo()
  const h = makeHandlers({ adapter, repo, config: { mode: "sandbox" } })
  const res = fakeRes()
  await h.createCheckout({ __json: { amount: "92.00", currency: "SAR" } }, res, fakeSrv())
  assert.equal(res._status, 201)
  assert.equal(res._body.data.checkoutId, "chk_1")
  assert.equal(res._body.data.base, "https://eu-test.oppwa.com")
  assert.ok(repo.calls.some((c) => c[0] === "createTransaction"))
})

test("POST /checkouts: missing amount -> 422, no PSP call", async () => {
  let called = false
  const adapter = createAdapter({ mode: "sandbox", entityId: "E", accessToken: "T" },
    { httpClient: async () => { called = true; return { status: 200, json: {} } } })
  const res = fakeRes()
  await makeHandlers({ adapter, repo: recordingRepo(), config: { mode: "sandbox" } })
    .createCheckout({ __json: { currency: "SAR" } }, res, fakeSrv())
  assert.equal(res._status, 422)
  assert.equal(called, false)
})

test("webhook VALID signature: records valid + updates the transaction", async () => {
  const KEY = crypto.randomBytes(32).toString("hex")
  const adapter = createAdapter({ mode: "sandbox", entityId: "E", accessToken: "T", webhookSecret: KEY })
  const repo = recordingRepo()
  const enc = __encryptForTest(KEY, { id: "chk_1", result: { code: "000.000.000" } })
  const res = fakeRes()
  await makeHandlers({ adapter, repo, config: { mode: "sandbox" } })
    .webhook(webhookReq(enc.bodyHex, enc.ivHex, enc.authTagHex), res, fakeSrv())
  assert.equal(res._status, 200)
  const wh = repo.calls.find((c) => c[0] === "recordWebhookEvent")
  assert.equal(wh[1].signatureValid, true)
  assert.ok(repo.calls.some((c) => c[0] === "updateTransactionByCheckout" && c[1] === "chk_1"))
})

test("webhook INVALID signature: FAIL CLOSED — 400, signature_valid=false, transaction NOT touched", async () => {
  const KEY = crypto.randomBytes(32).toString("hex")
  const adapter = createAdapter({ mode: "sandbox", entityId: "E", accessToken: "T", webhookSecret: KEY })
  const repo = recordingRepo()
  const enc = __encryptForTest(KEY, { id: "chk_1", result: { code: "000.000.000" } })
  const badBody = enc.bodyHex.replace(/.$/, (m) => (m === "0" ? "1" : "0"))
  const res = fakeRes()
  await makeHandlers({ adapter, repo, config: { mode: "sandbox" } })
    .webhook(webhookReq(badBody, enc.ivHex, enc.authTagHex), res, fakeSrv())
  assert.equal(res._status, 400)
  assert.equal(res._body.error.code, "WEBHOOK_SIGNATURE_INVALID")
  const wh = repo.calls.find((c) => c[0] === "recordWebhookEvent")
  assert.equal(wh[1].signatureValid, false)
  assert.equal(repo.calls.find((c) => c[0] === "updateTransactionByCheckout"), undefined)
})
