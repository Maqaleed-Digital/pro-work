# WORKCAPTAIN / PROWORK — PHASE 48 EVIDENCE CONTRACT

## Required evidence
- PRECHECK.txt
- ROUTE_TEST_HEALTH.txt
- ROUTE_TEST_INVALID_INTAKE.txt
- ROUTE_TEST_VALID_INTAKE.txt
- ROUTE_TEST_AUTHORIZED_ADVANCE.txt
- ROUTE_TEST_AUTHORIZED_APPROVE.txt
- ROUTE_TEST_AUTHORIZED_WORK_ITEM_CREATED.txt
- ROUTE_TEST_UNAUTHORIZED_START_BLOCKED.txt
- ROUTE_TEST_INVALID_COMPLETE_BLOCKED.txt
- ROUTE_TEST_AUTHORIZED_START.txt
- ROUTE_TEST_AUTHORIZED_BLOCK.txt
- ROUTE_TEST_AUTHORIZED_COMPLETE.txt
- ROUTE_TEST_WORK_ITEM_DETAIL.txt
- ROUTE_TEST_EXECUTION_QUEUE.txt
- ROUTE_TEST_EVENTS.txt
- ROUTE_TEST_BROWSER_HTML.txt
- ROUTE_TEST_BROWSER_JS.txt
- STATE_SNAPSHOT.json
- SUMMARY.md

## Required validation paths
### Blocked path
- invalid intake returns HTTP 422
- unauthorized start returns HTTP 403
- invalid complete ordering returns HTTP 422

### Active path
- valid intake returns HTTP 201
- authorized advance to BOARD_REVIEW returns HTTP 200
- authorized approve returns HTTP 200
- authorized work item creation returns HTTP 201
- authorized start returns HTTP 200
- authorized block returns HTTP 200
- authorized complete returns HTTP 200

## Stop condition
Phase 48 completes only when blocked and active paths both pass and state snapshot proves:
- exactly 1 intake
- exactly 1 opportunity
- opportunity stage = APPROVED
- work item count >= 2
- completed work item count >= 1
- blocked work item count >= 1
- execution queue count = 0
- event count >= 16
