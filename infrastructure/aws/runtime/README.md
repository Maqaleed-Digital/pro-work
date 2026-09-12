# WorkCaptain runtime tier — me-central-1 (WO-WC-DEPLOY-001)

Stands up the **runtime tier** (ECS Fargate service + ALB + ACM/HTTPS + RDS) on the
**existing $0-idle networking foundation** (`vpc-0c14a4f250b918527` / `prowork-production`,
account `822127611052`, region `me-central-1`). Makes `https://workcaptain.ai`
reachable — the prerequisite for HyperPay URL validation.

> The `infrastructure/aws/main.tf` **us-east-1 scaffold is DISCARDED** — not used here.

## Status: PLAN ONLY
`terraform apply` is **Sponsor-gated** (EA-001 / DL-078: production cutover is a
reserved escalation). This branch is for **plan review**. Verified plan:
**30 to add, 0 to change, 0 to destroy** (purely additive; foundation untouched).

## What it reuses vs. adds
- **Reuses (data sources):** VPC, public+private subnets (2 AZs), `prowork-production` ECR repo.
- **Adds:** 3 security groups (alb/ecs/rds), ALB + target group (health `/api/health`),
  ACM cert + DNS validation, 80→443 redirect + 443 listener (TLS1.3), ECS cluster +
  task def + Fargate service, RDS Postgres (private), Route53 zone + apex/www ALIAS,
  Secrets Manager (DATABASE_URL, ADMIN_API_TOKEN — values generated at apply).

## Gates (do not cross without Sponsor go)
- **No apply** here. `terraform apply` is denied/gated.
- **Payments stay sandbox**: the task sets `HYPERPAY_MODE=sandbox`. This deploy makes
  the SITE reachable; it does **not** enable live payments (no production mode, no
  live HyperPay creds — those are downstream). nav-model G5 markers are untouched.
- **No secrets committed**: passwords are `random_password` → Secrets Manager only;
  state (`*.tfstate`) is gitignored.

## Apply sequence (when Sponsor authorizes — for reference, not executed here)
1. **Build & push the image** (the service has no image otherwise):
   `docker build -f infrastructure/docker/Dockerfile` → push to the `ecr_image_to_push` output URI.
2. `terraform apply` (Sponsor-run; harness hard-denies apply for the agent).
3. **Delegate DNS once**: point the `workcaptain.ai` registrar nameservers at the
   `route53_nameservers` output. ACM validation + apex/www then resolve automatically.
4. Verify `https://workcaptain.ai/api/health` returns `200` → URL is HyperPay-validatable.

## Notes
- Fargate tasks run in **public subnets w/ public IP** (pull ECR via the IGW — the
  foundation has **no NAT**); the ECS SG admits the app port **only from the ALB**.
  More-locked-down alternative: private subnets + VPC endpoints (ECR/logs/secrets) —
  swap `assign_public_ip`/subnets and add endpoints.
- Health check targets **`/api/health`** (public, no-auth) — NOT `/api/admin/health`
  (which requires a token and would fail health checks).
- `manage_dns_in_route53=true` (default) makes ACM validation + records terraform-
  managed. Set `false` to use external DNS and add the `acm_validation_records` +
  an apex/www record at your provider manually.
