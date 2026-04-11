# WORKCAPTAIN / PROWORK — PHASE 45 EVIDENCE CONTRACT

## Required evidence
- PRECHECK.txt
- ROUTE_TEST_HEALTH.txt
- ROUTE_TEST_INVALID_INTAKE.txt
- ROUTE_TEST_VALID_INTAKE.txt
- ROUTE_TEST_OPPORTUNITY_DETAIL.txt
- ROUTE_TEST_UNAUTHORIZED_ADVANCE.txt
- ROUTE_TEST_AUTHORIZED_ADVANCE.txt
- ROUTE_TEST_BOARD_QUEUE.txt
- ROUTE_TEST_EVENTS.txt
- ROUTE_TEST_BROWSER_HTML.txt
- ROUTE_TEST_BROWSER_JS.txt
- STATE_SNAPSHOT.json
- SUMMARY.md

## Required validation paths
### Blocked path
- invalid intake returns HTTP 422
- unauthorized stage advance returns HTTP 403

### Active path
- valid intake returns HTTP 201
- authorized stage advance returns HTTP 200

## Stop condition
Phase 45 completes only when blocked and active paths both pass and state snapshot proves:
- exactly 1 intake
- exactly 1 opportunity
- opportunity stage = BOARD_REVIEW
- board queue count >= 1
- event count >= 5
