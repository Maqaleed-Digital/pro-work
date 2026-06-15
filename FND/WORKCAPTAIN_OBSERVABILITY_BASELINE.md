# WORKCAPTAIN — OBSERVABILITY BASELINE

Version: 1.0  
Status: ACTIVE

## 1. Goal

Provide minimum viable observability for semi-public beta ingress.

## 2. Required Signals

- edge request visibility
- backend request success/failure visibility
- latency visibility
- certificate status visibility
- Cloud Armor policy hit visibility
- basic error monitoring

## 3. Minimum Baseline

Required baseline artifacts:

- ingress logs available
- backend logs available
- request success confirmation
- negative test evidence
- monitored endpoint checks for `/health` or `/ready`
- alerting definition for backend unavailability or elevated failures

## 4. Suggested Alert Baseline

At minimum define and record:

- uptime failure on public health endpoint
- elevated 5xx ratio or repeated backend failures
- optional certificate provisioning lag review item

## 5. Evidence

Evidence should include:
- log samples
- monitoring configuration output where available
- successful curl checks
- failed forbidden route checks
- manifest with timestamps
