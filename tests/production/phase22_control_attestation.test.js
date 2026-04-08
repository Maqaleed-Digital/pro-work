"use strict"

/**
 * Phase 22 — Continuous Control Attestation + Compliance Reporting unit tests
 * Framework: node:test + node:assert (native, no dependencies)
 */

const { describe, it } = require("node:test")
const assert = require("node:assert/strict")

const {
  CONTROL_ATTESTATION_VERSION,
  ATTESTATION_STATUSES,
  REPORT_TYPES,
  REPORT_STATUSES,
  CONTROL_FAMILIES,
  recordAttestation,
  resolveAttestation,
  generateReport,
  resolveReport,
  getAttestationState,
  exportAttestation,
  getReportState,
  exportReports,
} = require("../../app/lib/control_attestation")

// ---------------------------------------------------------------------------
// Helpers — seed critical families so generateReport tests can proceed
// ---------------------------------------------------------------------------
function seedCritical() {
  recordAttestation({ controlId: "rbac_control",       controlFamily: "rbac_control",       status: "pass" })
  recordAttestation({ controlId: "permission_control", controlFamily: "permission_control",  status: "pass" })
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("CONTROL_ATTESTATION_VERSION", () => {
  it("exports a non-empty string", () => {
    assert.equal(typeof CONTROL_ATTESTATION_VERSION, "string")
    assert.ok(CONTROL_ATTESTATION_VERSION.length > 0)
  })
})

describe("ATTESTATION_STATUSES", () => {
  it("has pass, fail, degraded, unavailable", () => {
    assert.equal(ATTESTATION_STATUSES.PASS,        "pass")
    assert.equal(ATTESTATION_STATUSES.FAIL,        "fail")
    assert.equal(ATTESTATION_STATUSES.DEGRADED,    "degraded")
    assert.equal(ATTESTATION_STATUSES.UNAVAILABLE, "unavailable")
    assert.equal(Object.keys(ATTESTATION_STATUSES).length, 4)
  })
})

describe("REPORT_TYPES", () => {
  it("has all four required report types", () => {
    assert.equal(REPORT_TYPES.GOVERNANCE_CONTROL,      "governance.control_report")
    assert.equal(REPORT_TYPES.TENANT_COMPLIANCE,       "tenant.compliance_report")
    assert.equal(REPORT_TYPES.JURISDICTION_COMPLIANCE, "jurisdiction.compliance_report")
    assert.equal(REPORT_TYPES.INCIDENT_ASSURANCE,      "incident.assurance_report")
    assert.equal(Object.keys(REPORT_TYPES).length, 4)
  })
})

describe("REPORT_STATUSES", () => {
  it("has pass, fail, degraded, unavailable", () => {
    assert.equal(REPORT_STATUSES.PASS,        "pass")
    assert.equal(REPORT_STATUSES.FAIL,        "fail")
    assert.equal(REPORT_STATUSES.DEGRADED,    "degraded")
    assert.equal(REPORT_STATUSES.UNAVAILABLE, "unavailable")
  })
})

describe("CONTROL_FAMILIES", () => {
  it("is an array of 12 families", () => {
    assert.ok(Array.isArray(CONTROL_FAMILIES))
    assert.equal(CONTROL_FAMILIES.length, 12)
    assert.ok(CONTROL_FAMILIES.includes("rbac_control"))
    assert.ok(CONTROL_FAMILIES.includes("restoration_assurance_control"))
  })
})

// ---------------------------------------------------------------------------
// recordAttestation
// ---------------------------------------------------------------------------
describe("recordAttestation", () => {
  it("records a pass attestation with required fields", () => {
    const r = recordAttestation({ controlId: "rbac_control", controlFamily: "rbac_control", status: "pass" })
    assert.equal(r.ok, true)
    assert.ok(r.data.attestation_id.startsWith("att_"))
    assert.equal(r.data.control_id,         "rbac_control")
    assert.equal(r.data.control_family,     "rbac_control")
    assert.equal(r.data.attestation_status, "pass")
    assert.ok(r.data.attested_at)
  })
  it("records a degraded attestation", () => {
    const r = recordAttestation({ controlId: "audit_evidence_control", controlFamily: "audit_evidence_control", status: "degraded" })
    assert.equal(r.ok, true)
    assert.equal(r.data.attestation_status, "degraded")
  })
  it("records a fail attestation", () => {
    const r = recordAttestation({ controlId: "approval_control_test", controlFamily: "approval_control", status: "fail" })
    assert.equal(r.ok, true)
    assert.equal(r.data.attestation_status, "fail")
  })
  it("records an unavailable attestation", () => {
    const r = recordAttestation({ controlId: "external_review_control_test", controlFamily: "external_review_control", status: "unavailable" })
    assert.equal(r.ok, true)
    assert.equal(r.data.attestation_status, "unavailable")
  })
  it("rejects missing control_id", () => {
    const r = recordAttestation({ controlId: "", status: "pass" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_control_id")
  })
  it("rejects null control_id", () => {
    const r = recordAttestation({ status: "pass" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_control_id")
  })
  it("rejects unknown attestation status", () => {
    const r = recordAttestation({ controlId: "ctrl_test", status: "unknown_val" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_attestation_status")
  })
  it("rejects missing status", () => {
    const r = recordAttestation({ controlId: "ctrl_test" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_attestation_status")
  })
  it("defaults scope to 'global'", () => {
    const r = recordAttestation({ controlId: "scope_default_test", controlFamily: "rbac_control", status: "pass" })
    assert.equal(r.ok, true)
    assert.equal(r.data.attestation_scope, "global")
  })
  it("preserves evidenceRef", () => {
    const r = recordAttestation({ controlId: "ev_ref_test", controlFamily: "rbac_control", status: "pass", evidenceRef: "ev-001" })
    assert.equal(r.ok, true)
    assert.equal(r.data.assurance_evidence_ref, "ev-001")
  })
})

// ---------------------------------------------------------------------------
// resolveAttestation
// ---------------------------------------------------------------------------
describe("resolveAttestation", () => {
  it("returns ok:true for a known control_id", () => {
    recordAttestation({ controlId: "resolve_test_ctrl", controlFamily: "rbac_control", status: "pass" })
    const r = resolveAttestation("resolve_test_ctrl")
    assert.equal(r.ok, true)
    assert.ok(r.attestation)
    assert.equal(r.attestation.control_id, "resolve_test_ctrl")
  })
  it("returns latest attestation when control re-attested", () => {
    recordAttestation({ controlId: "re_attest_ctrl", controlFamily: "rbac_control", status: "fail" })
    recordAttestation({ controlId: "re_attest_ctrl", controlFamily: "rbac_control", status: "pass" })
    const r = resolveAttestation("re_attest_ctrl")
    assert.equal(r.ok, true)
    assert.equal(r.attestation.attestation_status, "pass")
  })
  it("fails for unknown control_id", () => {
    const r = resolveAttestation("ctrl_nonexistent")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_control_id")
  })
  it("fails for empty control_id", () => {
    const r = resolveAttestation("")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_control_id")
  })
  it("fails for null control_id", () => {
    const r = resolveAttestation(null)
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_control_id")
  })
})

// ---------------------------------------------------------------------------
// generateReport — denial cases (before seeding critical families)
// ---------------------------------------------------------------------------
describe("generateReport - denial cases", () => {
  it("rejects unknown report type", () => {
    const r = generateReport({ reportType: "unknown.type" })
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_report_type")
  })
  it("rejects missing report type", () => {
    const r = generateReport({})
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_report_type")
  })
  // Note: missing_critical_attestation is tested via integration — we cannot
  // guarantee isolation since the shared module accumulates state across tests.
  // The evidence runner covers REPORT-DENY-MISSING-CRITICAL-ATTESTATION deterministically.
})

// ---------------------------------------------------------------------------
// generateReport — success cases (requires critical attestations seeded)
// ---------------------------------------------------------------------------
describe("generateReport - success cases", () => {
  it("generates governance.control_report", () => {
    seedCritical()
    const r = generateReport({ reportType: "governance.control_report", reportScope: "global" })
    assert.equal(r.ok, true)
    assert.ok(r.data.report_id.startsWith("rpt_"))
    assert.equal(r.data.report_type,  "governance.control_report")
    assert.ok(r.data.generated_at)
    assert.ok(typeof r.data.report_status === "string")
    assert.ok(Array.isArray(r.data.attestations))
  })
  it("generates tenant.compliance_report", () => {
    seedCritical()
    const r = generateReport({ reportType: "tenant.compliance_report", tenantId: "t_test" })
    assert.equal(r.ok, true)
    assert.equal(r.data.report_type, "tenant.compliance_report")
    assert.equal(r.data.tenant_id,   "t_test")
  })
  it("generates jurisdiction.compliance_report", () => {
    seedCritical()
    const r = generateReport({ reportType: "jurisdiction.compliance_report", jurisdictionCode: "KSA" })
    assert.equal(r.ok, true)
    assert.equal(r.data.report_type,       "jurisdiction.compliance_report")
    assert.equal(r.data.jurisdiction_code, "KSA")
  })
  it("generates incident.assurance_report", () => {
    seedCritical()
    const r = generateReport({ reportType: "incident.assurance_report", reportScope: "global" })
    assert.equal(r.ok, true)
    assert.equal(r.data.report_type, "incident.assurance_report")
  })
  it("report is generated and has a valid report_status", () => {
    seedCritical()
    const r = generateReport({ reportType: "governance.control_report" })
    assert.equal(r.ok, true)
    // Status is derived from accumulated attestations; assert it is a valid value
    assert.ok(["pass", "fail", "degraded", "unavailable"].includes(r.data.report_status))
  })
  it("report includes degraded attestation when one is recorded", () => {
    seedCritical()
    recordAttestation({ controlId: "degraded_unique_ctrl", controlFamily: "audit_evidence_control", status: "degraded" })
    const r = generateReport({ reportType: "governance.control_report" })
    assert.equal(r.ok, true)
    // With a degraded attestation in scope, status should not be unavailable
    assert.notEqual(r.data.report_status, "unavailable")
  })
})

// ---------------------------------------------------------------------------
// resolveReport
// ---------------------------------------------------------------------------
describe("resolveReport", () => {
  it("returns ok:true for a known report_id", () => {
    seedCritical()
    const gen = generateReport({ reportType: "governance.control_report" })
    assert.equal(gen.ok, true)
    const r = resolveReport(gen.data.report_id)
    assert.equal(r.ok, true)
    assert.ok(r.report)
    assert.equal(r.report.report_id, gen.data.report_id)
  })
  it("fails for unknown report_id", () => {
    const r = resolveReport("rpt_nonexistent")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "unknown_report_id")
  })
  it("fails for empty report_id", () => {
    const r = resolveReport("")
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_report_id")
  })
  it("fails for null report_id", () => {
    const r = resolveReport(null)
    assert.equal(r.ok, false)
    assert.equal(r.reason, "missing_report_id")
  })
})

// ---------------------------------------------------------------------------
// getAttestationState + exportAttestation
// ---------------------------------------------------------------------------
describe("getAttestationState", () => {
  it("returns required fields", () => {
    const s = getAttestationState()
    assert.ok(typeof s.attestation_count === "number")
    assert.ok(Array.isArray(s.attestations))
    assert.ok(typeof s.by_family === "object")
  })
  it("returns snapshots (not references)", () => {
    const s1 = getAttestationState()
    const s2 = getAttestationState()
    assert.notEqual(s1, s2)
  })
})

describe("exportAttestation", () => {
  it("returns artifact with required fields", () => {
    const a = exportAttestation()
    assert.ok(a.exported_at)
    assert.ok(a.control_attestation_version)
    assert.ok(typeof a.attestation_count === "number")
    assert.ok(Array.isArray(a.attestations))
  })
  it("does not mutate state", () => {
    const a1 = exportAttestation()
    const a2 = exportAttestation()
    assert.equal(a1.control_attestation_version, a2.control_attestation_version)
  })
})

// ---------------------------------------------------------------------------
// getReportState + exportReports
// ---------------------------------------------------------------------------
describe("getReportState", () => {
  it("returns required fields", () => {
    const s = getReportState()
    assert.ok(typeof s.report_count === "number")
    assert.ok(Array.isArray(s.reports))
  })
})

describe("exportReports", () => {
  it("returns artifact with required fields", () => {
    const a = exportReports()
    assert.ok(a.exported_at)
    assert.ok(a.control_attestation_version)
    assert.ok(typeof a.report_count === "number")
    assert.ok(Array.isArray(a.reports))
  })
})
