'use strict';

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

// ── load versioned PDPL policies ──────────────────────────────────────────────

const COMPLIANCE_DIR = path.join(__dirname, '../../config/compliance');

function loadPdplPolicies() {
  const policies = {};
  try {
    const files = fs.readdirSync(COMPLIANCE_DIR).filter(f => /^pdpl_policy_v\d+\.json$/.test(f));
    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(COMPLIANCE_DIR, file), 'utf8'));
      policies[raw.version] = raw;
    }
  } catch { /* config dir may not exist in all environments */ }
  return policies;
}

const _DEFAULT_PDPL_POLICIES = loadPdplPolicies();

// ── error helpers ─────────────────────────────────────────────────────────────

function pdplError(message, code) {
  const err = new Error(message);
  err.name = 'PdplServiceError';
  err.code = code || 'PDPL_ERROR';
  return err;
}

function assert(condition, message, code) {
  if (!condition) throw pdplError(message, code);
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function nowIso() { return new Date().toISOString(); }

// ── valid DSR types ───────────────────────────────────────────────────────────

const DSR_TYPES       = new Set(['ACCESS', 'CORRECTION', 'DELETION', 'PORTABILITY', 'OBJECTION', 'RESTRICTION']);
const TERMINAL_STATUSES = new Set(['COMPLETED', 'REJECTED']);
const VALID_ACTIONS   = new Set(['ACKNOWLEDGED', 'IN_REVIEW', 'COMPLETED', 'REJECTED', 'EXTENDED']);

// ── document templates ────────────────────────────────────────────────────────

const DOCUMENT_TEMPLATES = {
  DPIA: `DATA PROTECTION IMPACT ASSESSMENT (DPIA)
تقييم أثر حماية البيانات

Organization: ProWork Platform
Version: 1.0 | Date: 2026-01-01
Jurisdiction: KSA PDPL + UAE Federal PDPL (Law 45/2021)

1. PROCESSING DESCRIPTION
   Purpose: Workforce management, payroll processing, recruitment, and HR analytics
   Data categories: Personal identification, employment data, payroll, performance records
   Data subjects: Workers, candidates, HR personnel

2. NECESSITY AND PROPORTIONALITY
   Processing is limited to what is necessary for employment contract performance.
   Data minimization principles applied per KSA PDPL Article 9.

3. RISK ASSESSMENT
   Risk: Unauthorized access to personal data
   Mitigation: Role-based access control, encryption at rest and in transit

   Risk: Personal data breach
   Mitigation: Incident response plan, 72-hour notification to NDMO / UAE TDRA

   Risk: Cross-border transfer without adequate safeguards
   Mitigation: SCCs executed, data residency controls active, transfer impact assessments performed

4. TECHNICAL AND ORGANISATIONAL CONTROLS
   - AES-256 encryption for data at rest; TLS 1.3 in transit
   - Access limited to authorized personnel by role (RBAC)
   - Immutable audit logs for all personal data access
   - DSR portal with 30-day SLA (alert at day 25)
   - Annual DPIA review by DPO

5. DPO SIGN-OFF
   DPO Review Date: 2026-01-01
   Next Review: 2027-01-01
   Status: APPROVED
`,

  SCC: `STANDARD CONTRACTUAL CLAUSES (SCCs)
الشروط التعاقدية القياسية

Agreement: ProWork Platform (Data Controller) ↔ Third-Party Processors
Reference: KSA PDPL Article 29 — Cross-Border Data Transfer
UAE Reference: UAE Federal Decree-Law No. 45/2021 Article 22

CLAUSE 1 — DEFINITIONS
"Controller": ProWork Platform
"Processor": Any third-party service provider processing personal data on behalf of ProWork
"Personal Data": Any information relating to an identified or identifiable natural person
"Processing": Any operation performed on personal data

CLAUSE 2 — OBLIGATIONS OF THE PROCESSOR
2.1 Process personal data only on documented instructions from the Controller
2.2 Ensure persons authorised to process personal data are bound by confidentiality obligations
2.3 Implement appropriate technical and organisational security measures per KSA PDPL Article 19
2.4 Notify Controller without undue delay (within 24 hours) of any personal data breach
2.5 Assist Controller in fulfilling data subject rights requests within 30-day SLA
2.6 Delete or return all personal data upon termination of services
2.7 Not sub-process data without prior written authorisation from Controller

CLAUSE 3 — DATA SUBJECT RIGHTS
Processor shall assist Controller in responding to DSRs:
ACCESS, CORRECTION, DELETION, PORTABILITY, OBJECTION, RESTRICTION

CLAUSE 4 — AUDIT RIGHTS
Controller may audit Processor's compliance upon reasonable notice.

CLAUSE 5 — GOVERNING LAW
These clauses are governed by the laws of the Kingdom of Saudi Arabia.
Effective: 2026-01-01
`,

  DPO_APPOINTMENT: `DATA PROTECTION OFFICER (DPO) APPOINTMENT NOTICE
إشعار تعيين مسؤول حماية البيانات

Organization: ProWork Platform
Date of Appointment: 2026-01-01
Legal Basis:
  - KSA PDPL Article 31 (Appointment of Data Protection Officer)
  - UAE Federal Decree-Law No. 45/2021 Article 10

DPO RESPONSIBILITIES:
1. Monitor and enforce compliance with KSA PDPL and UAE Federal PDPL
2. Advise on Data Protection Impact Assessments (DPIA)
3. Act as point of contact for data subjects exercising their rights
4. Liaise with regulatory authorities (NDMO — KSA / TDRA — UAE)
5. Oversee DSR processing and ensure 30-day SLA compliance
6. Maintain and review the Lawful Basis Registry
7. Manage personal data breach response and regulatory notification
8. Conduct annual compliance reviews and staff training

CONTACT DETAILS:
DPO Email: dpo@prowork.sa
Regulatory Contact KSA: National Data Management Office (NDMO) — ndmo.gov.sa
Regulatory Contact UAE: Telecommunications and Digital Government Regulatory Authority (TDRA) — tdra.gov.ae

DATA BREACH NOTIFICATION:
In the event of a personal data breach, notification to NDMO / TDRA within 72 hours.

This appointment is effective from 2026-01-01 and subject to annual review.
`,

  DATA_RESIDENCY: `DATA RESIDENCY STATEMENT
بيان إقامة البيانات

Organization: ProWork Platform
Effective Date: 2026-01-01
Regulations: KSA PDPL / UAE Federal Decree-Law No. 45/2021

1. PRIMARY DATA RESIDENCY
   KSA data subjects: Personal data stored in data centres within the Kingdom of Saudi Arabia (Riyadh Region).
   UAE data subjects: Personal data stored in data centres within the United Arab Emirates (Abu Dhabi Zone).

2. DATA CATEGORIES AND STORAGE LOCATIONS
   Worker personal identification data : KSA primary / UAE primary (jurisdiction of employment)
   Payroll and financial data          : KSA (Riyadh) — AES-256 encrypted at rest
   Recruitment and candidate data      : Same jurisdiction as hiring entity
   Audit logs and compliance records   : KSA primary, UAE secondary (replicated, encrypted)
   Evidence packs (EP_WOS_*)           : KSA primary — immutable, append-only

3. CROSS-BORDER TRANSFERS
   Any cross-border transfer of personal data requires ONE of:
   a) Destination country with adequate protection level recognised by NDMO, OR
   b) Execution of Standard Contractual Clauses (SCCs) with the receiving party, OR
   c) Explicit, informed consent of the data subject

4. PERSONAL DATA BREACH NOTIFICATION
   KSA: Notify National Data Management Office (NDMO) within 72 hours
   UAE: Notify TDRA within 72 hours
   Data subjects: Notified without undue delay where breach is high-risk

5. RETENTION PERIODS
   Personal data is retained only as long as necessary for the stated processing purpose.
   Retention periods are defined per data category in the Lawful Basis Registry.
   Data is securely deleted or anonymised at end of retention period.

Certified by: Data Protection Officer
Last Updated: 2026-01-01
`,
};

// ── in-memory DSR store ───────────────────────────────────────────────────────

/**
 * InMemoryDsrStore
 *
 * DSR records with embedded actions[] — append-only immutable audit trail.
 * Actions are never removed or modified once written.
 */
class InMemoryDsrStore {
  constructor() {
    this._dsrs = new Map();
  }

  async insertDsr(dsr) {
    assert(!this._dsrs.has(dsr.dsr_id), `DSR already exists: ${dsr.dsr_id}`, 'DUPLICATE_DSR');
    this._dsrs.set(dsr.dsr_id, clone(dsr));
    return clone(dsr);
  }

  async getDsr(dsrId) {
    return this._dsrs.has(dsrId) ? clone(this._dsrs.get(dsrId)) : null;
  }

  async updateDsr(dsrId, patch) {
    const current = this._dsrs.get(dsrId);
    assert(current, `DSR not found: ${dsrId}`, 'DSR_NOT_FOUND');
    // Never overwrite actions via patch — actions are append-only
    const { actions: _ignored, ...safePatch } = patch;
    const next = { ...current, ...clone(safePatch) };
    this._dsrs.set(dsrId, next);
    return clone(next);
  }

  async appendAction(dsrId, action) {
    const current = this._dsrs.get(dsrId);
    assert(current, `DSR not found: ${dsrId}`, 'DSR_NOT_FOUND');
    current.actions.push(clone(action));
    this._dsrs.set(dsrId, current);
    return clone(current);
  }

  async allDsrs(tenantId) {
    const all = Array.from(this._dsrs.values()).map(clone);
    return tenantId ? all.filter(d => d.tenant_id === tenantId) : all;
  }
}

// ── service factory ───────────────────────────────────────────────────────────

/**
 * createPdplService({ store, hooks, policies? })
 *
 * Methods:
 *   submitDsr(input)                           — create DSR, emit DSR_SUBMITTED event
 *   processDsr(dsrId, actionType, actorId, notes?) — advance status, append immutable log entry
 *   getDsrStatus(dsrId)                        — DSR with computed SLA fields
 *   checkSlaAlerts(tenantId?)                  — DSRs at/past day-25 alert threshold
 *   getLawfulBasisRegistry()                   — full registry from active policy
 *   getDocumentContent(docType)                — template text for DPIA/SCC/DPO/DATA_RESIDENCY
 *   listDsrs(tenantId?)                        — all DSRs with SLA fields
 *
 * Constraints:
 *   - COMPLETED and REJECTED are terminal — no further processDsr calls permitted
 *   - Actions[] is append-only — patch to updateDsr strips the actions field
 *   - SLA alert fires at >= alert_threshold_days (default: 25), not at SLA breach day (30)
 *   - All DSR events published to hooks with trust_level HIGH
 */
function createPdplService({ store, hooks, policies } = {}) {
  assert(store, 'store is required');
  assert(hooks && typeof hooks.publish === 'function', 'hooks.publish is required');

  const _policies = policies || _DEFAULT_PDPL_POLICIES;

  function getActivePolicy() {
    const versions = Object.keys(_policies).sort().reverse();
    return versions.length > 0 ? _policies[versions[0]] : null;
  }

  function getSlaConfig() {
    const p = getActivePolicy();
    return p ? p.dsrSlaConfig : { sla_days: 30, alert_threshold_days: 25 };
  }

  function computeDaysSince(submittedAt) {
    return (Date.now() - new Date(submittedAt).getTime()) / (1000 * 60 * 60 * 24);
  }

  function computeSlaFields(dsr) {
    const cfg       = getSlaConfig();
    const daysSince = computeDaysSince(dsr.submitted_at);
    const isTerminal = TERMINAL_STATUSES.has(dsr.status);
    return {
      days_since_submission: Math.floor(daysSince),
      days_remaining:        isTerminal ? null : Math.max(0, Math.ceil(cfg.sla_days - daysSince)),
      sla_days:              cfg.sla_days,
      alert_threshold_days:  cfg.alert_threshold_days,
      sla_alert:             !isTerminal && daysSince >= cfg.alert_threshold_days,
      sla_breached:          !isTerminal && daysSince >= cfg.sla_days,
    };
  }

  // ── submitDsr ───────────────────────────────────────────────────────────────

  async function submitDsr(input) {
    assert(input.dsr_id,          'dsr_id is required');
    assert(input.tenant_id,       'tenant_id is required');
    assert(input.data_subject_id, 'data_subject_id is required');
    assert(input.dsr_type,        'dsr_type is required');
    assert(
      DSR_TYPES.has(input.dsr_type),
      `dsr_type must be one of: ${[...DSR_TYPES].join(', ')}`,
      'INVALID_DSR_TYPE',
    );

    const submittedAt = input.submitted_at || nowIso();
    const cfg = getSlaConfig();

    const dsr = await store.insertDsr({
      dsr_id:          input.dsr_id,
      tenant_id:       input.tenant_id,
      data_subject_id: input.data_subject_id,
      dsr_type:        input.dsr_type,
      description:     input.description  || null,
      status:          'SUBMITTED',
      submitted_at:    submittedAt,
      completed_at:    null,
      assigned_to:     input.assigned_to  || null,
      actions: [{
        action_id:   crypto.randomUUID(),
        action_type: 'SUBMITTED',
        actor_id:    input.submitted_by || input.data_subject_id,
        timestamp:   submittedAt,
        notes:       'DSR submitted',
      }],
    });

    await hooks.publish({
      event_id:       input.event_id      || crypto.randomUUID(),
      event_type:     'DSR_SUBMITTED',
      event_version:  '1.0',
      occurred_at:    submittedAt,
      tenant_id:      input.tenant_id,
      aggregate_type: 'DSR',
      aggregate_id:   input.dsr_id,
      actor:          input.actor || { actor_type: 'DATA_SUBJECT', actor_id: input.data_subject_id },
      correlation_id: input.correlation_id || null,
      causation_id:   input.causation_id   || null,
      source: { service: 'compliance', module: 'pdpl_service', environment: process.env.NODE_ENV || 'development' },
      trust_level:        'STANDARD',
      requires_approval:  false,
      payload: {
        dsr_id:          dsr.dsr_id,
        tenant_id:       dsr.tenant_id,
        data_subject_id: dsr.data_subject_id,
        dsr_type:        dsr.dsr_type,
        sla_due_by:      new Date(new Date(submittedAt).getTime() + cfg.sla_days * 86400000).toISOString(),
      },
      metadata: input.metadata || {},
    });

    return dsr;
  }

  // ── processDsr ──────────────────────────────────────────────────────────────

  async function processDsr(dsrId, actionType, actorId, notes) {
    assert(dsrId,      'dsrId is required');
    assert(actionType, 'actionType is required');
    assert(actorId,    'actorId is required');
    assert(
      VALID_ACTIONS.has(actionType),
      `actionType must be one of: ${[...VALID_ACTIONS].join(', ')}`,
      'INVALID_ACTION_TYPE',
    );

    const current = await store.getDsr(dsrId);
    assert(current, `DSR not found: ${dsrId}`, 'DSR_NOT_FOUND');
    assert(
      !TERMINAL_STATUSES.has(current.status),
      `DSR ${dsrId} is in terminal status ${current.status} — no further actions permitted`,
      'DSR_TERMINAL',
    );

    const timestamp    = nowIso();
    const actionRecord = {
      action_id:   crypto.randomUUID(),
      action_type: actionType,
      actor_id:    actorId,
      timestamp,
      notes:       notes || null,
    };

    // EXTENDED keeps current status but appends log entry
    const newStatus  = actionType === 'EXTENDED' ? current.status : actionType;
    const isTerminal = TERMINAL_STATUSES.has(newStatus);

    await store.appendAction(dsrId, actionRecord);
    const updated = await store.updateDsr(dsrId, {
      status:       newStatus,
      completed_at: isTerminal ? timestamp : (current.completed_at || null),
    });

    await hooks.publish({
      event_id:       crypto.randomUUID(),
      event_type:     `DSR_${actionType}`,
      event_version:  '1.0',
      occurred_at:    timestamp,
      tenant_id:      current.tenant_id,
      aggregate_type: 'DSR',
      aggregate_id:   dsrId,
      actor:          { actor_type: 'HR', actor_id: actorId },
      correlation_id: null,
      causation_id:   null,
      source: { service: 'compliance', module: 'pdpl_service', environment: process.env.NODE_ENV || 'development' },
      trust_level:        'HIGH',
      requires_approval:  false,
      payload: { dsr_id: dsrId, action_type: actionType, new_status: newStatus, actor_id: actorId },
      metadata: {},
    });

    return updated;
  }

  // ── getDsrStatus ────────────────────────────────────────────────────────────

  async function getDsrStatus(dsrId) {
    assert(dsrId, 'dsrId is required');
    const dsr = await store.getDsr(dsrId);
    assert(dsr, `DSR not found: ${dsrId}`, 'DSR_NOT_FOUND');
    return { ...dsr, sla: computeSlaFields(dsr) };
  }

  // ── checkSlaAlerts ──────────────────────────────────────────────────────────

  async function checkSlaAlerts(tenantId) {
    const all = await store.allDsrs(tenantId);
    return all
      .filter(dsr => !TERMINAL_STATUSES.has(dsr.status))
      .map(dsr => ({ ...dsr, sla: computeSlaFields(dsr) }))
      .filter(dsr => dsr.sla.sla_alert || dsr.sla.sla_breached)
      .sort((a, b) => (a.sla.days_remaining ?? 0) - (b.sla.days_remaining ?? 0));
  }

  // ── getLawfulBasisRegistry ──────────────────────────────────────────────────

  function getLawfulBasisRegistry() {
    const p = getActivePolicy();
    return p ? clone(p.lawfulBasisRegistry) : [];
  }

  // ── getDocumentContent ──────────────────────────────────────────────────────

  function getDocumentContent(docType) {
    const p = getActivePolicy();
    if (!p) return null;
    const doc = (p.documents || []).find(d => d.doc_type === docType);
    if (!doc) return null;
    return DOCUMENT_TEMPLATES[docType] || null;
  }

  // ── listDsrs ────────────────────────────────────────────────────────────────

  async function listDsrs(tenantId) {
    const all = await store.allDsrs(tenantId);
    return all.map(dsr => ({ ...dsr, sla: computeSlaFields(dsr) }));
  }

  return {
    submitDsr,
    processDsr,
    getDsrStatus,
    checkSlaAlerts,
    getLawfulBasisRegistry,
    getDocumentContent,
    listDsrs,
    _policies,
  };
}

module.exports = {
  createPdplService,
  InMemoryDsrStore,
};
