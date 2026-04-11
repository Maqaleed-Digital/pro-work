# WORKCAPTAIN / PROWORK — PHASE 46 EVIDENCE CONTRACT

## Required evidence
- PRECHECK.txt
- ROUTE_TEST_HEALTH.txt
- ROUTE_TEST_INVALID_INTAKE.txt
- ROUTE_TEST_VALID_INTAKE.txt
- ROUTE_TEST_AUTHORIZED_ADVANCE.txt
- ROUTE_TEST_UNAUTHORIZED_APPROVE.txt
- ROUTE_TEST_AUTHORIZED_APPROVE.txt
- ROUTE_TEST_DECISION_AUDIT.txt
- ROUTE_TEST_BOARD_QUEUE.txt
- ROUTE_TEST_EVENTS.txt
- ROUTE_TEST_BROWSER_HTML.txt
- ROUTE_TEST_BROWSER_JS.txt
- STATE_SNAPSHOT.json
- SUMMARY.md

## Required validation paths
### Blocked path
- invalid intake returns HTTP 422
- unauthorized approve returns HTTP 403

### Active path
- valid intake returns HTTP 201
- authorized advance to BOARD_REVIEW returns HTTP 200
- authorized approve returns HTTP 200

## Stop condition
Phase 46 completes only when blocked and active paths both pass and state snapshot proves:
- exactly 1 intake
- exactly 1 opportunity
- opportunity stage = APPROVED
- approval record count >= 1
- board queue count = 0
- event count >= 7
