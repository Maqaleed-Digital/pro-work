# TRAFFIC ACTIVATION RUNBOOK

## Objective
Begin controlled user traffic with monitoring in place and clear rollback checks.

## Activation Order
1. Confirm uptime checks passing
2. Confirm alert policies enabled
3. Confirm dashboard exists
4. Confirm public endpoints healthy
5. Confirm logs flowing for web-service and api-service
6. Start controlled traffic activation
7. Observe logs and dashboard for first-user sessions

## Rollback Triggers
- Public health endpoint failure
- Sustained 5xx errors
- TLS or edge routing regression
- Login path failure
- Severe latency regression

## Immediate Rollback Actions
- Pause traffic activation
- Review latest Cloud Run revisions
- Inspect load balancer configuration
- Validate health endpoints directly
