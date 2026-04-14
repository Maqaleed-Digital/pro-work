# WORKCAPTAIN — CLOUD RUN REDEPLOY PROTOCOL
#
# Status: ACTIVE

## Protocol

Source-based Cloud Run deploys use `gcloud run deploy --source <dir>`.
Cloud Build builds a container image from the source directory and deploys it.

### Env Var Safety Rule

Use `--update-env-vars` (NOT `--set-env-vars`) when redeploying with additional vars.
`--set-env-vars` REPLACES all env vars on the revision; `--update-env-vars` MERGES.

Using `--set-env-vars` with only BQ vars will destroy:
- `API_ORIGIN` on web-service (breaks frontend → API routing)
- `API_*_TOKEN` vars on api-service (breaks authentication)

### Deploy Command Pattern

```bash
gcloud run deploy <service> \
  --source <source_dir> \
  --project <project_id> \
  --region <region> \
  --update-env-vars KEY1=VAL1,KEY2=VAL2
```

### Verified Live Env Vars (as of Phase 100)

**web-service:**
- API_ORIGIN=https://api.workcaptain.ai
- WORKCAPTAIN_BQ_PROJECT_ID=prj-maq-workcaptain-nonprod
- WORKCAPTAIN_BQ_DATASET=workcaptain_analytics

**api-service:**
- API_ADMIN_TOKEN=wc-admin-phase10-token
- API_OPERATOR_TOKEN=wc-operator-phase10-token
- API_VIEWER_TOKEN=wc-viewer-phase10-token
- WORKCAPTAIN_BQ_PROJECT_ID=prj-maq-workcaptain-nonprod
- WORKCAPTAIN_BQ_DATASET=workcaptain_analytics
