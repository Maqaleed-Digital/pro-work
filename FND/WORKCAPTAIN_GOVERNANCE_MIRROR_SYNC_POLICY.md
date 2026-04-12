# WORKCAPTAIN — GOVERNANCE MIRROR SYNC POLICY

Status: ACTIVE  
Authority: Phase 65

## 1. Principle
The governance mirror sync service must be evidence-driven, replayable, and safe to run repeatedly.
Mirror payloads must contain metadata only — no raw file contents, no secrets, no runtime credentials.

## 2. Mirror Sync States
- `MIRROR_SYNC_OPERATIONAL` — full evidence chain intact, runtime posture healthy
- `MIRROR_SYNC_WARNING` — evidence chain intact, runtime posture near threshold
- `MIRROR_SYNC_ESCALATED` — prior escalation exists or current posture breaches warning threshold
- `MIRROR_SYNC_BLOCKED` — evidence chain broken or runtime continuity invalid

## 3. Mirror Payload Rules
Every mirror payload must include:
- source of truth commit hash
- evidence directory references (phase 62, 63, 64, 65)
- mirror sync state
- timestamp
- metadataOnly: true flag
- NO file contents
- NO runtime credentials

## 4. Sync Actions
The sync service emits actions for downstream consumers:
- `MIRROR_SYNC_PUBLISH` — publish mirror payload to registered consumers
- `MIRROR_SYNC_HOLD` — hold publication pending manual review
- `MIRROR_SYNC_ESCALATE` — escalate to governance board

## 5. Non-Negotiables
- no silent success
- no inferred continuity
- no mirror sync success without fresh measurements
- no closure of escalated posture inside the sync script
- no mutation of production runtime by the mirror sync service
- no file contents in mirror payloads
