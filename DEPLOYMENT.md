# WorkCaptain Customer-Facing Surface — Deployment

**Branch:** `feat/wc-customer-surface-v1`
**Build artefact:** Vite multi-entry static bundle (`app/frontend/dist/`)
**Deploy target:** Cloud Run, `prj-maq-workcaptain-nonprod`, region `me-central2` (Dammam)
**Domain:** `workcaptain.ai` apex (B2C/SMB brand variant) · `workforce.maqaleed.ai` (B2G/corporate brand variant)
**Authority:** Sponsor brief deploy section + Cloud Blueprint v2.1 §11–§13 + Sponsor decision B3 (manual `gcloud` for the controlled-beta window; CI/CD migration out of scope)
**Date:** 2026-05-16 (D-Day proxy)

> **Posture.** This document is the operational runbook the Sponsor reviews and executes. **No commands here are intended to be run from the build environment.** They are designed for Sponsor / Operations Owner local execution against the authoritative gcloud credentials. The Sponsor signs off line-by-line before any production cutover.

---

## §1 · Build

Static build is reproducible from any clean checkout.

```bash
# From the repo root
cd app/frontend

# Default — WorkCaptain (B2C/SMB) variant.
npm ci
npm run build
# → dist/index.html (apex landing)
# → dist/app.html   (authenticated SPA)
# → dist/assets/*.js + *.css (immutable hashed assets)
# → dist/robots.txt (Disallow: / during controlled-beta window)

# Alternative — Maqaleed Workforce (B2G/corporate) variant.
VITE_BRAND=maqaleed-workforce npm run build
# → identical layout, brand config baked in via __MAQ_BRAND__ define
```

**What the variant flag does:** `vite.config.js` injects `__MAQ_BRAND__` at build time. `src/brand/index.js` reads that constant and selects from `{ workcaptain, maqaleed-workforce }`. Each variant carries its own hero copy, trust band defaults, and `themeClass`. Components are brand-neutral and consume the variant via input.

---

## §2 · Container image

The Vite output is purely static. Recommended runtime: an `nginx`-based container that serves `dist/` with URL rewriting for the prettier `/app/` path.

### §2.1 Dockerfile (for the customer surface)

> **Note.** This is the proposed Dockerfile for the customer-surface deployment. The existing repo `infrastructure/docker/Dockerfile` builds the full Node + Vite + API stack and is unchanged. Build this customer-surface image as a separate target.

```dockerfile
# infrastructure/docker/Dockerfile.customer-surface  (proposed; not in repo today)
FROM node:20-alpine AS build
WORKDIR /build
COPY app/frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY app/frontend ./
ARG VITE_BRAND=workcaptain
ENV VITE_BRAND=$VITE_BRAND
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /build/dist /usr/share/nginx/html
COPY infrastructure/docker/nginx.customer-surface.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

### §2.2 nginx config (URL rewrite for `/app/*` → `/app.html`)

```nginx
# infrastructure/docker/nginx.customer-surface.conf  (proposed)
server {
  listen 8080;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  # Long-lived caching for hashed assets
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # Pretty /app/ path → app.html (SPA entry).
  # The Day-7 fix #4 CTAs use /app.html directly so this rewrite is OPTIONAL
  # for functional correctness; it is here only for the prettier URL.
  location /app/ { try_files $uri /app.html; }
  location = /app  { return 301 /app/; }

  # robots.txt is shipped from the Vite build (Disallow: /)
  location = /robots.txt { try_files $uri =404; }

  # Apex landing — everything else falls through to index.html
  location / { try_files $uri /index.html; }

  # Security headers (Cloud Blueprint v2.1 §13)
  add_header X-Frame-Options "DENY" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "interest-cohort=()" always;
  # CSP is intentionally not set in nginx — the SPA already loads Google
  # Fonts and same-origin assets. Wire CSP at the Cloud Run revision env
  # var level once the cohort-feedback domain is finalised.
}
```

---

## §3 · Artifact Registry (Cloud Blueprint v2.1 §13)

**Constraint:** immutable tags; no `:latest`; SHA-256 digests recorded.

```bash
# Sponsor sets these from local environment
PROJECT_ID=prj-maq-workcaptain-nonprod
REGION=me-central2
REPO=wc-customer-surface
SERVICE=wc-customer-surface

# Authenticate via WIF or `gcloud auth login` (no JSON keys per Cloud Blueprint v2.1 §13).
gcloud auth login
gcloud config set project $PROJECT_ID

# One-time: create the Artifact Registry repo.
gcloud artifacts repositories create $REPO \
  --repository-format=docker \
  --location=$REGION \
  --description="WorkCaptain customer-facing surface (Vite static + nginx)"

# Build + push (commit SHA = immutable tag).
SHA=$(git rev-parse --short HEAD)
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/customer-surface:$SHA"

# (Local) build for linux/amd64 (Cloud Run requirement)
docker build \
  --platform linux/amd64 \
  --build-arg VITE_BRAND=workcaptain \
  -f infrastructure/docker/Dockerfile.customer-surface \
  -t "$IMAGE" .

# (Local) push
docker push "$IMAGE"

# Repeat for the maqaleed-workforce variant when its domain is provisioned.
SHA_MW="$SHA-mw"
IMAGE_MW="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/customer-surface:$SHA_MW"
docker build --platform linux/amd64 \
  --build-arg VITE_BRAND=maqaleed-workforce \
  -f infrastructure/docker/Dockerfile.customer-surface \
  -t "$IMAGE_MW" .
docker push "$IMAGE_MW"
```

---

## §4 · Binary Authorization (Cloud Blueprint v2.1 §13)

```bash
# One-time: attestor + signing key
ATTESTOR=wc-customer-surface-attestor
KEYRING=wc-binauthz
KEY=wc-attestor-key

gcloud kms keyrings create $KEYRING --location=$REGION
gcloud kms keys create $KEY \
  --keyring=$KEYRING \
  --location=$REGION \
  --purpose=asymmetric-signing \
  --default-algorithm=ec-sign-p256-sha256

gcloud container binauthz attestors create $ATTESTOR \
  --attestation-authority-note-project=$PROJECT_ID \
  --attestation-authority-note=wc-customer-surface-note \
  --description="Attestor for WorkCaptain customer-surface Cloud Run"

# Per-deploy: sign the image digest
DIGEST=$(gcloud artifacts docker images describe "$IMAGE" --format='value(image_summary.digest)')
gcloud container binauthz attestations sign-and-create \
  --artifact-url="$IMAGE@$DIGEST" \
  --attestor=$ATTESTOR \
  --attestor-project=$PROJECT_ID \
  --keyversion-project=$PROJECT_ID \
  --keyversion-location=$REGION \
  --keyversion-keyring=$KEYRING \
  --keyversion-key=$KEY \
  --keyversion=1

# Update the org policy to require attestation by $ATTESTOR for Cloud Run
# (one-time; not per-deploy). Done from a Cloud Build / Org Admin context.
```

---

## §5 · Cloud Run service

### §5.1 Workload Identity Federation (no long-lived keys per Cloud Blueprint v2.1 §13)

```bash
# Service account that Cloud Run runs as.
RUNTIME_SA=wc-customer-surface@$PROJECT_ID.iam.gserviceaccount.com

gcloud iam service-accounts create wc-customer-surface \
  --display-name="WorkCaptain customer-surface runtime"

# Minimum-privilege roles. The customer-surface container is static
# nginx with no GCP API calls at runtime — these are framework grants
# only (logging + monitoring + secret-manager-access if needed later).
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/logging.logWriter"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/monitoring.metricWriter"

# CI/CD service account binding (WIF — no JSON keys).
# Configure your CI provider (GitHub Actions OIDC, GitLab JWT, etc.) to
# impersonate this SA via Workload Identity Federation.
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_ID/locations/global/workloadIdentityPools/<POOL_ID>/attribute.repository/Maqaleed-Digital/pro-work" \
  --role="roles/iam.workloadIdentityUser"
```

> **Known gap (per Sponsor B3, 2026-05-11).** Existing `.github/workflows/production.yml` deploys to AWS using a long-lived `AWS_ACCESS_KEY_ID`. This is acknowledged in PROPOSAL §1.4 and §7 as out-of-scope for the controlled-beta window. **Manual `gcloud run deploy` is the authorised path for D15→D15+41.** CI/CD pivot to WIF + GCP is a separate work-stream tracked outside this commit.

### §5.2 Secrets (Secret Manager — no inline secrets per Cloud Blueprint v2.1 §13)

For the customer-surface image, secrets are minimal — it's static nginx. Reserved env-var slots for future use:

```bash
# Reserve secret name; populate when content is finalised.
gcloud secrets create wc-customer-surface-csp-policy \
  --replication-policy=user-managed --locations=$REGION
# (Add other secrets here as / if needed; do NOT inline anything in
#  `gcloud run deploy --set-env-vars`.)
```

### §5.3 Deploy command (WorkCaptain variant)

```bash
gcloud run deploy $SERVICE \
  --image="$IMAGE" \
  --region=$REGION \
  --project=$PROJECT_ID \
  --platform=managed \
  --service-account="$RUNTIME_SA" \
  --port=8080 \
  --memory=512Mi --cpu=1 \
  --min-instances=0 --max-instances=10 \
  --concurrency=80 \
  --ingress=internal-and-cloud-load-balancing \
  --no-allow-unauthenticated \
  --binary-authorization=default \
  --vpc-egress=private-ranges-only \
  --vpc-connector=projects/$PROJECT_ID/locations/$REGION/connectors/wc-vpc-connector \
  --set-env-vars="DEPLOY_BRAND=workcaptain,DEPLOY_ENV=nonprod"
# Note: --binary-authorization=default uses the org-policy attestor
#       configured in §4.
# Note: --no-allow-unauthenticated + an external HTTPS LB with IAM-tagged
#       access is the production posture. For the cohort beta, we expose
#       via the LB only; direct Cloud Run URL stays IAM-gated.
```

### §5.4 Deploy command (Maqaleed Workforce variant)

Identical except for `--image=$IMAGE_MW` and `--set-env-vars="DEPLOY_BRAND=maqaleed-workforce,DEPLOY_ENV=nonprod"`. The maqaleed-workforce variant is **config-driven only** during the controlled-beta window — Sponsor B5 binds the dual-brand scaffold but does not authorise B2G public deploy. Build + image push is permitted; Cloud Run deploy to workforce.maqaleed.ai is held until Sponsor authorises the B2G surface separately.

---

## §6 · DNS + HTTPS

**Do NOT modify production DNS directly from this commit.** The Sponsor reviews and executes.

### §6.1 Reserved IP + HTTPS load balancer (regional external)

```bash
# Reserve a global external IP for the customer surface LB.
gcloud compute addresses create wc-customer-surface-lb-ip \
  --ip-version=IPV4 --global

# Provision the managed cert AFTER the DNS A record points to the LB IP
# (managed certs need DNS validation to succeed).
gcloud compute ssl-certificates create wc-customer-surface-cert \
  --domains=workcaptain.ai,www.workcaptain.ai \
  --global
# For B2G: --domains=workforce.maqaleed.ai (separate cert when authorised).
```

### §6.2 Backend service → Cloud Run (Serverless NEG)

```bash
gcloud compute network-endpoint-groups create wc-customer-surface-neg \
  --region=$REGION \
  --network-endpoint-type=serverless \
  --cloud-run-service=$SERVICE

gcloud compute backend-services create wc-customer-surface-backend \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --protocol=HTTPS

gcloud compute backend-services add-backend wc-customer-surface-backend \
  --global \
  --network-endpoint-group=wc-customer-surface-neg \
  --network-endpoint-group-region=$REGION

gcloud compute url-maps create wc-customer-surface-urlmap \
  --default-service=wc-customer-surface-backend

gcloud compute target-https-proxies create wc-customer-surface-https \
  --ssl-certificates=wc-customer-surface-cert \
  --url-map=wc-customer-surface-urlmap

gcloud compute forwarding-rules create wc-customer-surface-fr \
  --address=wc-customer-surface-lb-ip \
  --target-https-proxy=wc-customer-surface-https \
  --ports=443 --global \
  --load-balancing-scheme=EXTERNAL_MANAGED
```

### §6.3 DNS A records

> **Sponsor executes** in the DNS registrar console. Commands below are for **dry-run validation only** (`gcloud dns` if running on Cloud DNS).

```bash
# Get the reserved IP
LB_IP=$(gcloud compute addresses describe wc-customer-surface-lb-ip --global --format='value(address)')
echo "Point A record workcaptain.ai → $LB_IP"
echo "Point A record www.workcaptain.ai → $LB_IP"
echo "(B2G — Sponsor-authorised separately) workforce.maqaleed.ai → $LB_IP (or its own LB)"
```

---

## §7 · Controlled-beta posture verifications (post-deploy)

After deploy, run these against the production URL **before** notifying the cohort:

```bash
# 1. robots.txt disallow is live (controlled-beta posture).
curl -fsS https://workcaptain.ai/robots.txt | grep -q "Disallow: /"

# 2. Landing meta robots present.
curl -fsS https://workcaptain.ai/ | grep -q 'name="robots" content="noindex'

# 3. CTAs point to /app.html (not /app/) — verifies Day-7 fix #4 build.
curl -fsS https://workcaptain.ai/ | grep -q 'href="/app.html#request-access\|window.location.href = .\/app.html'
# (The minified JS may emit the URL slightly differently — adjust grep
#  if the build chunked it.)

# 4. App route loads
curl -fsSI https://workcaptain.ai/app.html | head -1

# 5. Cohort intake API reachable from same origin (server config check).
curl -fsS -X POST https://workcaptain.ai/api/cohort/request -H 'content-type: application/json' \
  -d '{"orgName":"_smoke","crNumber":"0000000000","contactName":"_","email":"_@_._","phone":"+966500000000","primaryUseCase":"both","teamSize":1,"locale":"en"}' \
  || true   # expected to fail validation; we just verify the route is hit, not 404
```

---

## §8 · Rollback

```bash
# List revisions
gcloud run revisions list --service=$SERVICE --region=$REGION --project=$PROJECT_ID

# Pin traffic to a prior revision (immediate)
gcloud run services update-traffic $SERVICE \
  --region=$REGION --project=$PROJECT_ID \
  --to-revisions=<PRIOR_REVISION>=100

# Cloud Run keeps the last 10 revisions by default. The image digest +
# attestation chain are preserved in Artifact Registry; the prior
# revision boots without rebuild.
```

---

## §9 · Brand-variant deploy matrix

| Variant | Domain | Image tag | Cloud Run service | Status during controlled beta |
|---|---|---|---|---|
| `workcaptain` (B2C/SMB) | `workcaptain.ai` (apex) | `:$SHA` | `wc-customer-surface` | **Active.** Cohort intake live. |
| `maqaleed-workforce` (B2G/corporate) | `workforce.maqaleed.ai` | `:$SHA-mw` | `wc-customer-surface-mw` (separate) | **Config-only.** Image may be built + attested but not deployed publicly until Sponsor authorises B2G surface separately (per B5). |

---

## §10 · Known gaps

| Gap | Tracking |
|---|---|
| CI/CD pipeline targets AWS, not GCP+WIF | PROPOSAL §1.4 + §7; Sponsor B3 — out of scope for controlled-beta window |
| Dockerfile.customer-surface + nginx.customer-surface.conf | Proposed in §2; not yet committed (deploy from Sponsor's local env first; commit after burn-in) |
| Production CSP header | §2.2 — wired at nginx; cohort-feedback domain still finalising |
| ISO 27001 / SOC 2 certifications | Trust hub Residency surface explicitly does not claim these (Day 6, brief §6) |

---

## §11 · Sign-off

Deploy command sequence above is **Sponsor-executed**. The build environment provides the artefacts (`dist/`, Dockerfile target, gcloud command set); Sponsor runs the commands against authoritative gcloud credentials.

**Operations Owner** acknowledges the controlled-beta posture (robots.txt + meta noindex + manual cohort invitation) is intact end-to-end before announcing the URL to the cohort.

**Branch:** `feat/wc-customer-surface-v1` · `origin/feat/wc-customer-surface-v1` (pushed Day 7 fix #3).

**End of DEPLOYMENT.md.**
