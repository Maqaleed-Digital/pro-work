# UPTIME MONITORING SPEC

## Endpoints
- https://workcaptain.ai/health
- https://api.workcaptain.ai/health

## Expected Status
- HTTP 200 for both endpoints

## Monitoring Objective
Detect public availability regressions at the edge and application layers.

## Cadence
- 1 minute period for uptime checks

## Success Threshold
- Endpoint returns 200 consistently

## Failure Response
- Trigger alert policy
- Review Cloud Run revisions
- Review HTTPS load balancer status
- Review DNS and certificate status if edge-layer issue suspected
