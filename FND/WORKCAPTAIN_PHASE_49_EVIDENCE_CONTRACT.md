# WORKCAPTAIN / PROWORK — PHASE 49 EVIDENCE CONTRACT

## Required evidence
- PRECHECK.txt
- ROUTE_TEST_HEALTH.txt
- ROUTE_TEST_INVALID_INTAKE.txt
- ROUTE_TEST_VALID_INTAKE.txt
- ROUTE_TEST_AUTHORIZED_ADVANCE.txt
- ROUTE_TEST_AUTHORIZED_APPROVE.txt
- ROUTE_TEST_AUTHORIZED_WORK_ITEM_CREATED.txt
- ROUTE_TEST_AUTHORIZED_START.txt
- ROUTE_TEST_AUTHORIZED_COMPLETE.txt
- ROUTE_TEST_PRECOMPLETION_DELIVERY_BLOCKED.txt
- ROUTE_TEST_UNAUTHORIZED_DELIVERY_BLOCKED.txt
- ROUTE_TEST_AUTHORIZED_DELIVERY_CREATED.txt
- ROUTE_TEST_DELIVERY_LIST.txt
- ROUTE_TEST_DELIVERY_DETAIL.txt
- ROUTE_TEST_EVENTS.txt
- ROUTE_TEST_BROWSER_HTML.txt
- ROUTE_TEST_BROWSER_JS.txt
- STATE_SNAPSHOT.json
- SUMMARY.md

## Required validation paths
### Blocked path
- invalid intake returns HTTP 422
- delivery artifact creation before completion returns HTTP 422
- unauthorized delivery artifact creation returns HTTP 403

### Active path
- valid intake returns HTTP 201
- authorized advance to BOARD_REVIEW returns HTTP 200
- authorized approve returns HTTP 200
- authorized work item creation returns HTTP 201
- authorized start returns HTTP 200
- authorized complete returns HTTP 200
- authorized delivery artifact creation returns HTTP 201

## Stop condition
Phase 49 completes only when blocked and active paths both pass and state snapshot proves:
- exactly 1 intake
- exactly 1 opportunity
- opportunity stage = APPROVED
- work item count >= 1
- completed work item count >= 1
- delivery artifact count >= 1
- event count >= 16
