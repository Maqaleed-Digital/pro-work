# WORKCAPTAIN ROLLBACK CONTRACT

Status: ACTIVE

Rollback triggers:
- service fails to deploy
- endpoint verification fails
- service returns non-200 health
- runtime secret binding fails
- internal alpha verification fails

Rollback requirements:
- capture previous revision names before deploy
- capture previous image references where available
- redeploy prior revision or route traffic back to prior revision
- record rollback evidence and final status

Evidence required:
- pre-cutover revisions
- deployed revisions
- verification logs
- rollback actions if invoked
