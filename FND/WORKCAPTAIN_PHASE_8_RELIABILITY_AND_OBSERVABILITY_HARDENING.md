# WORKCAPTAIN — PHASE 8 RELIABILITY AND OBSERVABILITY HARDENING

Version: 1.0  
Status: ACTIVE  
Applies From Commit Baseline: 8e206e9a384a69718f602406e682493839b83b0d

## 1. Purpose

This phase hardens live-system reliability and observability after real runtime activation and route-governance closure.

## 2. Entering Baseline

Confirmed entering state:

- public edge active at `api.workcaptain.ai`
- Cloud Armor active
- real runtime active across four Cloud Run services
- `/admin` no longer publicly accessible
- platform operating as a controlled live system

## 3. Objective

Establish minimum viable production operations visibility and failure awareness through:

- uptime checks
- alert policies
- baseline SLO framing
- dashboard/runbook evidence
- service-level visibility across all four Cloud Run services

## 4. In Scope

- uptime check for public API health endpoint
- baseline alert policies for availability/failure signals
- Cloud Run service visibility snapshots
- monitoring contract
- SLO/alert baseline documentation
- evidence-first execution
- operational runbook notes

## 5. Out of Scope

- auth and identity implementation
- feature expansion
- domain/business logic changes
- infrastructure redesign
- load balancer redesign
- Cloud Armor redesign
- formal on-call rotation tooling
- advanced tracing implementation

## 6. Required Targets

Operational visibility must cover:

- `api-service`
- `trust-processor`
- `agent-orchestrator`
- `background-worker`

Public uptime monitoring target:

- `https://api.workcaptain.ai/health`

## 7. Minimum Success State

At phase completion:

- uptime check exists for public health endpoint
- at least one alert policy exists for uptime failure
- at least one alert policy exists for backend failure signal or unhealthy condition
- evidence captures monitoring resources created
- runbook and handoff notes are recorded

## 8. Completion Gate

Phase 8 is complete only when:

1. uptime monitoring exists for `https://api.workcaptain.ai/health`
2. alerting baseline is created
3. evidence captures created monitoring resources
4. service inventory snapshots are recorded
5. handoff notes are recorded
