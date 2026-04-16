# WORKCAPTAIN — BETA ROLLOUT AND ROLLBACK

Version: 1.0  
Status: ACTIVE

## 1. Rollout Objective

Introduce governed public beta ingress for `api.workcaptain.ai` with immediate rollback safety.

## 2. Rollout Sequence

1. Reserve global IP
2. Create serverless NEG
3. Create backend service
4. Attach Cloud Armor
5. Create URL map
6. Create managed certificate
7. Create HTTPS proxy
8. Create forwarding rule
9. Point DNS to global IP
10. Wait for certificate activation
11. Validate approved routes
12. Validate forbidden route failure
13. Capture evidence

## 3. Rollback Triggers

Rollback is required if any of the following occur:

- unexpected public exposure of forbidden routes
- significant 5xx errors after cutover
- Cloud Armor misconfiguration blocks expected baseline traffic
- certificate fails to provision after DNS is correct and waiting period is exceeded
- backend service mapping is incorrect
- public beta causes unacceptable operational risk

## 4. Rollback Actions

Fast rollback options:

### Option A — Remove DNS cutover
Revert or remove DNS mapping for `api.workcaptain.ai`

### Option B — Disable forwarding path
Delete or disable forwarding rule / proxy / URL map chain

### Option C — Detach backend
Remove backend attachment from public backend service

### Option D — Tighten Armor
Apply deny posture while retaining infrastructure for investigation

## 5. Evidence Requirements

Evidence pack must include:
- pre-change baseline
- created resource inventory
- DNS result
- certificate status
- test results for allowed route
- test results for forbidden route
- rollback command references
- manifest of outputs
