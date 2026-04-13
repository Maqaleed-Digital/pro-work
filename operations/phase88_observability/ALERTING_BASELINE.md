# ALERTING BASELINE

## Alert Classes
1. Uptime failure — web health
2. Uptime failure — api health
3. Cloud Run 5xx spike — api-service
4. Cloud Run 5xx spike — web-service
5. Cloud Run latency degradation — api-service
6. Cloud Run latency degradation — web-service

## Initial Severity
- High: uptime failures
- Medium: 5xx spikes
- Medium: latency degradation

## Notification Channel Strategy
Start with email channel to the authenticated operator account, then extend later.

## Fail-Closed Rule
No phase pass without at least:
- 2 uptime checks
- 2 uptime alert policies
- 1 dashboard
