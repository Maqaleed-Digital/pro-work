# WORKCAPTAIN / PROWORK — PHASE 44 EVIDENCE CONTRACT

## Required evidence
The execution script must generate the following artifacts:

- PRECHECK.txt
- ROUTE_TEST_HEALTH.txt
- ROUTE_TEST_COMMAND_CENTER_BEFORE.txt
- ROUTE_TEST_INVALID_INTAKE.txt
- ROUTE_TEST_VALID_INTAKE.txt
- ROUTE_TEST_OPPORTUNITIES_AFTER.txt
- ROUTE_TEST_COMMAND_CENTER_AFTER.txt
- ROUTE_TEST_BROWSER_HTML.txt
- ROUTE_TEST_BROWSER_JS.txt
- STATE_SNAPSHOT.json
- SUMMARY.md

## Validation paths
### Blocked path
A deliberately invalid intake request must fail with HTTP 422.

### Active path
A valid intake request must succeed with HTTP 201 and persist state.

## Stop condition
Phase 44 is complete only when blocked-path and active-path checks both pass.
