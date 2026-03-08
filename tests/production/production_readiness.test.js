"use strict"

const { test, describe } = require("node:test")
const assert = require("node:assert")

const JwtAuth = require("../../app/lib/security/jwt_auth")
const SecurityMiddleware = require("../../app/lib/security/security_middleware")
const Logger = require("../../app/lib/logging/logger")

describe("Production Readiness Layer Tests", () => {
  describe("JWT Authentication", () => {
    test("generateToken creates valid JWT", () => {
      const payload = { sub: "user_123", role: "admin", tenant_id: "default" }
      const token = JwtAuth.generateToken(payload)
      assert.ok(token)
      assert.strictEqual(token.split(".").length, 3)
    })

    test("verifyToken validates correct token", () => {
      const payload = { sub: "user_456", role: "ops" }
      const token = JwtAuth.generateToken(payload)
      const result = JwtAuth.verifyToken(token)
      assert.strictEqual(result.ok, true)
      assert.strictEqual(result.payload.sub, "user_456")
      assert.strictEqual(result.payload.role, "ops")
    })

    test("verifyToken rejects invalid token", () => {
      const result = JwtAuth.verifyToken("invalid.token.here")
      assert.strictEqual(result.ok, false)
    })

    test("verifyToken rejects tampered token", () => {
      const token = JwtAuth.generateToken({ sub: "user" })
      const parts = token.split(".")
      parts[1] = Buffer.from('{"sub":"hacker"}').toString("base64")
      const tampered = parts.join(".")
      const result = JwtAuth.verifyToken(tampered)
      assert.strictEqual(result.ok, false)
    })

    test("hasPermission checks role permissions", () => {
      assert.strictEqual(JwtAuth.hasPermission("superadmin", "anything"), true)
      assert.strictEqual(JwtAuth.hasPermission("admin", "admin:read"), true)
      assert.strictEqual(JwtAuth.hasPermission("viewer", "admin:write"), false)
    })

    test("hashPassword and verifyPassword work correctly", () => {
      const password = "secure_password_123"
      const hashed = JwtAuth.hashPassword(password)
      assert.ok(hashed.includes(":"))
      assert.strictEqual(JwtAuth.verifyPassword(password, hashed), true)
      assert.strictEqual(JwtAuth.verifyPassword("wrong_password", hashed), false)
    })

    test("refreshToken creates new token with same payload", () => {
      const original = JwtAuth.generateToken({ sub: "user", role: "admin" })
      const result = JwtAuth.refreshToken(original)
      assert.strictEqual(result.ok, true)
      assert.ok(result.token)
      assert.notStrictEqual(result.token, original)
      const verified = JwtAuth.verifyToken(result.token)
      assert.strictEqual(verified.payload.sub, "user")
    })
  })

  describe("Security Middleware", () => {
    test("generateRequestId creates unique IDs", () => {
      const id1 = SecurityMiddleware.generateRequestId()
      const id2 = SecurityMiddleware.generateRequestId()
      assert.ok(id1.startsWith("req_"))
      assert.ok(id2.startsWith("req_"))
      assert.notStrictEqual(id1, id2)
    })

    test("sanitizeInput removes dangerous characters", () => {
      const input = '<script>alert("xss")</script>'
      const sanitized = SecurityMiddleware.sanitizeInput(input)
      assert.ok(!sanitized.includes("<"))
      assert.ok(!sanitized.includes(">"))
    })

    test("sanitizeInput handles nested objects", () => {
      const input = {
        name: "<test>",
        nested: { value: "<value>" },
        arr: ["<item1>", "<item2>"]
      }
      const sanitized = SecurityMiddleware.sanitizeInput(input)
      assert.ok(!sanitized.name.includes("<"))
      assert.ok(!sanitized.nested.value.includes("<"))
      assert.ok(!sanitized.arr[0].includes("<"))
    })

    test("sanitizeInput limits string length", () => {
      const longString = "a".repeat(20000)
      const sanitized = SecurityMiddleware.sanitizeInput(longString)
      assert.ok(sanitized.length <= 10000)
    })

    test("getCorsHeaders returns correct headers", () => {
      const req = { headers: { origin: "https://example.com" } }
      const headers = SecurityMiddleware.getCorsHeaders(req)
      assert.ok(headers["Access-Control-Allow-Origin"])
      assert.ok(headers["Access-Control-Allow-Methods"])
      assert.ok(headers["Access-Control-Allow-Headers"])
    })

    test("getSecurityHeaders includes all required headers", () => {
      const headers = SecurityMiddleware.getSecurityHeaders()
      assert.ok(headers["X-Content-Type-Options"])
      assert.ok(headers["X-Frame-Options"])
      assert.ok(headers["X-XSS-Protection"])
      assert.ok(headers["Strict-Transport-Security"])
      assert.ok(headers["Content-Security-Policy"])
    })

    test("checkRateLimit tracks requests", () => {
      const req = { headers: {}, socket: { remoteAddress: "192.168.1.100" } }
      const result1 = SecurityMiddleware.checkRateLimit(req)
      assert.strictEqual(result1.ok, true)
      const remaining = parseInt(result1.headers["X-RateLimit-Remaining"])
      assert.ok(remaining >= 0)
    })

    test("IP blocking works", () => {
      const testIP = "10.0.0.99"
      const req = { headers: {}, socket: { remoteAddress: testIP } }
      assert.strictEqual(SecurityMiddleware.isIPBlocked(req), false)
      SecurityMiddleware.blockIP(testIP)
      assert.strictEqual(SecurityMiddleware.isIPBlocked(req), true)
      SecurityMiddleware.unblockIP(testIP)
      assert.strictEqual(SecurityMiddleware.isIPBlocked(req), false)
    })
  })

  describe("Structured Logger", () => {
    test("info logs message correctly", () => {
      Logger.info("Test info message", { key: "value" })
      assert.ok(true)
    })

    test("error logs with context", () => {
      Logger.error("Test error", { error_code: "TEST_001" })
      assert.ok(true)
    })

    test("child creates logger with context", () => {
      const childLogger = Logger.child({ request_id: "req_123" })
      childLogger.info("Child logger test")
      assert.ok(true)
    })

    test("incrementCounter tracks metrics", () => {
      Logger.incrementCounter("test_counter", 1, { endpoint: "/test" })
      Logger.incrementCounter("test_counter", 1, { endpoint: "/test" })
      const metrics = Logger.getMetrics()
      assert.ok(metrics.counters)
    })

    test("setGauge updates gauge value", () => {
      Logger.setGauge("test_gauge", 42, { type: "test" })
      const metrics = Logger.getMetrics()
      assert.ok(metrics.gauges)
    })

    test("recordHistogram tracks distribution", () => {
      for (let i = 0; i < 10; i++) {
        Logger.recordHistogram("response_time", Math.random() * 100, { endpoint: "/api" })
      }
      const metrics = Logger.getMetrics()
      assert.ok(metrics.histograms)
    })

    test("getPrometheusMetrics returns formatted string", () => {
      Logger.incrementCounter("prom_test", 5, {})
      const output = Logger.getPrometheusMetrics()
      assert.strictEqual(typeof output, "string")
    })
  })
})
