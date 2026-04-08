"use strict"

/**
 * PROWORK PHASE 14 — Sovereign Control Registry
 *
 * Centralized policy-bound configuration for privileged operations.
 * Controls resolve at runtime from the registry before execution.
 *
 * Storage: app/data/sovereign_registry.json (optional override file)
 * Default entries are built-in and authoritative if no file is present.
 *
 * Rules:
 * - resolveControl() is the only resolution path for privileged actions
 * - missing required entry => fail closed (ok: false, reason: "missing")
 * - disabled entry => fail closed (ok: false, reason: "disabled")
 * - unknown key => fail closed (ok: false, reason: "unknown_key")
 * - setControlStatus() is the only in-memory mutation path (admin + test use)
 * - exportRegistry() writes a machine-readable artifact without mutating state
 */

const fs     = require("fs")
const path   = require("path")

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------
const REGISTRY_VERSION = "1.0"

// ---------------------------------------------------------------------------
// Control families
// ---------------------------------------------------------------------------
const CONTROL_FAMILIES = Object.freeze({
  PRIVILEGED_OPERATION: "privileged_operation_policy",
  APPROVAL:             "approval_policy",
  PERMISSION:           "permission_policy",
  AUDIT:                "audit_policy",
  RUNTIME_GUARD:        "runtime_guard_policy",
})

// ---------------------------------------------------------------------------
// Control key catalog (stable string identifiers)
// ---------------------------------------------------------------------------
const CONTROL_KEYS = Object.freeze({
  OPS_OVERRIDE_REQUIRES_APPROVAL:        "ops.override.requires_approval",
  OPS_FORCE_EXECUTE_REQUIRES_APPROVAL:   "ops.force_execute.requires_approval",
  ADMIN_CONFIG_CHANGE_REQUIRES_APPROVAL: "admin.config_change.requires_approval",
  PRIVILEGED_AUDIT_REQUIRED:             "privileged.audit.required",
  PRIVILEGED_MAKER_CHECKER_REQUIRED:     "privileged.approval.maker_checker.required",
  SOVEREIGN_REGISTRY_VERSION:            "sovereign.registry.version",
  RUNTIME_GUARD_FAIL_CLOSED:             "runtime.guard.fail_closed.enabled",
})

// ---------------------------------------------------------------------------
// Status values
// ---------------------------------------------------------------------------
const STATUSES = Object.freeze({
  ACTIVE:     "active",
  DEPRECATED: "deprecated",
  DISABLED:   "disabled",
})

// ---------------------------------------------------------------------------
// Default registry entries (built-in, authoritative)
// ---------------------------------------------------------------------------
const _DEFAULT_ENTRIES = [
  {
    control_key:     CONTROL_KEYS.OPS_OVERRIDE_REQUIRES_APPROVAL,
    control_family:  CONTROL_FAMILIES.APPROVAL,
    control_version: "1.0.0",
    status:          STATUSES.ACTIVE,
    value:           true,
    description:     "ops.override requires a prior approved approval request",
    source:          "prowork.phase14",
    created_at:      "2026-04-08T00:00:00.000Z",
    evidence_version: REGISTRY_VERSION,
  },
  {
    control_key:     CONTROL_KEYS.OPS_FORCE_EXECUTE_REQUIRES_APPROVAL,
    control_family:  CONTROL_FAMILIES.APPROVAL,
    control_version: "1.0.0",
    status:          STATUSES.ACTIVE,
    value:           true,
    description:     "ops.force_execute requires a prior approved approval request",
    source:          "prowork.phase14",
    created_at:      "2026-04-08T00:00:00.000Z",
    evidence_version: REGISTRY_VERSION,
  },
  {
    control_key:     CONTROL_KEYS.ADMIN_CONFIG_CHANGE_REQUIRES_APPROVAL,
    control_family:  CONTROL_FAMILIES.APPROVAL,
    control_version: "1.0.0",
    status:          STATUSES.ACTIVE,
    value:           true,
    description:     "admin.config_change requires a prior approved approval request",
    source:          "prowork.phase14",
    created_at:      "2026-04-08T00:00:00.000Z",
    evidence_version: REGISTRY_VERSION,
  },
  {
    control_key:     CONTROL_KEYS.PRIVILEGED_AUDIT_REQUIRED,
    control_family:  CONTROL_FAMILIES.AUDIT,
    control_version: "1.0.0",
    status:          STATUSES.ACTIVE,
    value:           true,
    description:     "privileged operations must emit immutable authz audit records",
    source:          "prowork.phase14",
    created_at:      "2026-04-08T00:00:00.000Z",
    evidence_version: REGISTRY_VERSION,
  },
  {
    control_key:     CONTROL_KEYS.PRIVILEGED_MAKER_CHECKER_REQUIRED,
    control_family:  CONTROL_FAMILIES.APPROVAL,
    control_version: "1.0.0",
    status:          STATUSES.ACTIVE,
    value:           true,
    description:     "maker-checker enforcement required for designated approval-bound actions",
    source:          "prowork.phase14",
    created_at:      "2026-04-08T00:00:00.000Z",
    evidence_version: REGISTRY_VERSION,
  },
  {
    control_key:     CONTROL_KEYS.SOVEREIGN_REGISTRY_VERSION,
    control_family:  CONTROL_FAMILIES.PRIVILEGED_OPERATION,
    control_version: "1.0.0",
    status:          STATUSES.ACTIVE,
    value:           REGISTRY_VERSION,
    description:     "sovereign control registry schema version",
    source:          "prowork.phase14",
    created_at:      "2026-04-08T00:00:00.000Z",
    evidence_version: REGISTRY_VERSION,
  },
  {
    control_key:     CONTROL_KEYS.RUNTIME_GUARD_FAIL_CLOSED,
    control_family:  CONTROL_FAMILIES.RUNTIME_GUARD,
    control_version: "1.0.0",
    status:          STATUSES.ACTIVE,
    value:           true,
    description:     "runtime guard defaults to fail-closed for missing or invalid sovereign controls",
    source:          "prowork.phase14",
    created_at:      "2026-04-08T00:00:00.000Z",
    evidence_version: REGISTRY_VERSION,
  },
]

// ---------------------------------------------------------------------------
// In-memory registry state
// control_key → entry (mutable status only; all other fields immutable after load)
// ---------------------------------------------------------------------------
const _registry = new Map()

// Populate from defaults at module load time
for (const entry of _DEFAULT_ENTRIES) {
  _registry.set(entry.control_key, { ...entry })
}

// Set of all known keys (fail-closed on unknown)
const _knownKeys = new Set(Object.values(CONTROL_KEYS))

// ---------------------------------------------------------------------------
// loadRegistry — merge optional JSON override file into in-memory state
// Called once at server startup; override file can extend or update status.
// ---------------------------------------------------------------------------
function loadRegistry(filePath) {
  const target = filePath || path.join(__dirname, "..", "data", "sovereign_registry.json")
  try {
    if (!fs.existsSync(target)) return  // no override file; defaults are authoritative
    const raw  = fs.readFileSync(target, "utf8")
    const data = JSON.parse(raw)
    const entries = Array.isArray(data) ? data : (data.entries || [])
    for (const entry of entries) {
      if (entry && entry.control_key) {
        const existing = _registry.get(String(entry.control_key))
        if (existing) {
          // Override: only allow status and value to be updated from file
          _registry.set(String(entry.control_key), {
            ...existing,
            status: entry.status || existing.status,
            value:  entry.value !== undefined ? entry.value : existing.value,
          })
        }
        // Unknown keys in the override file are silently ignored (fail-closed default)
      }
    }
  } catch (_) {
    // Parse error → keep defaults (fail-closed)
  }
}

// ---------------------------------------------------------------------------
// resolveControl — deterministic resolution for a governed control key
// Returns { ok: true, entry, control_key, control_version } on active entry.
// Returns { ok: false, reason, control_key } on missing/disabled/unknown.
// ---------------------------------------------------------------------------
function resolveControl(key) {
  const k = String(key || "")

  if (!_knownKeys.has(k)) {
    return { ok: false, reason: "unknown_key", control_key: k, control_version: null }
  }

  const entry = _registry.get(k)
  if (!entry) {
    return { ok: false, reason: "missing", control_key: k, control_version: null }
  }
  if (entry.status !== STATUSES.ACTIVE) {
    return { ok: false, reason: "disabled", control_key: k, control_version: entry.control_version }
  }

  return {
    ok:              true,
    entry,
    control_key:     k,
    control_version: entry.control_version,
  }
}

// ---------------------------------------------------------------------------
// setControlStatus — in-memory update (admin endpoint + test use only)
// ---------------------------------------------------------------------------
function setControlStatus(key, status) {
  const k = String(key || "")
  if (!_knownKeys.has(k)) {
    return { ok: false, reason: "unknown_key" }
  }
  if (!Object.values(STATUSES).includes(status)) {
    return { ok: false, reason: "invalid_status" }
  }
  const entry = _registry.get(k)
  if (!entry) return { ok: false, reason: "missing" }
  _registry.set(k, { ...entry, status })
  return { ok: true, control_key: k, status }
}

// ---------------------------------------------------------------------------
// getRegistry — read-only snapshot of all entries
// ---------------------------------------------------------------------------
function getRegistry() {
  return Array.from(_registry.values()).map(e => ({ ...e }))
}

// ---------------------------------------------------------------------------
// exportRegistry — write JSON artifact (does not mutate in-memory state)
// ---------------------------------------------------------------------------
function exportRegistry(outputPath) {
  const entries  = getRegistry()
  const artifact = {
    exported_at:      new Date().toISOString(),
    registry_version: REGISTRY_VERSION,
    control_count:    entries.length,
    entries,
  }
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8")
  }
  return artifact
}

module.exports = {
  REGISTRY_VERSION,
  CONTROL_FAMILIES,
  CONTROL_KEYS,
  STATUSES,
  loadRegistry,
  resolveControl,
  setControlStatus,
  getRegistry,
  exportRegistry,
}
