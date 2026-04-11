# Hypercare Operations Runbook

## Preconditions
- Phase 60 complete
- production status = LIVE_VERIFIED
- hypercare variables resolved
- active runtime mounted with operational routes

## Steps
1. validate hypercare variables
2. verify LIVE_VERIFIED production state
3. persist ACTIVE_HYPERCARE state
4. verify mounted hypercare routes
5. capture stabilization evidence

## Failure posture
- stop on missing variables
- do not activate hypercare if production state is not LIVE_VERIFIED
