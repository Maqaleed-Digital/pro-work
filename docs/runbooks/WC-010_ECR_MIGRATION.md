# WC-010 — GHCR → ECR migration

| | |
|---|---|
| **Authority** | `DL-WC-ECR-AUTH-001` — **Ratified** 2026-09-12 (Immutable Lock: NO) |
| **Status** | **TOOLING BUILT — NO AWS RESOURCE CREATED, NO MIGRATION PERFORMED** |
| **Decision** | Option C — Amazon ECR, `eu-central-1` |
| **Accepted artifact** | `sha256:760bca143118f8bdba78143968ce7d470acb65be02ebe70b726275471c72df13` |
| **Rollback authority** | `workcaptain:19` — do not mutate or deregister |
| **Fallback commitment** | ECR not accepted by **2026-10-05** ⇒ WC-004 GHCR rotation **executes** |

## The binding predicate

```
SOURCE_GHCR_DIGEST == TARGET_ECR_DIGEST
```

**Digest equality is a required predicate, not an allowed delta.** The migration *copies* the
accepted artifact; it does not rebuild it. A second independent build from the same source SHA
is not bit-identical and would create a new provenance chain under a decision that authorised
moving the existing one.

**If exact digest preservation proves impossible, STOP and return for Sponsor disposition.
Do not silently rebuild.**

## Evidence that copy preserves the digest

Proven read-only before the tooling was written, against the actual target technology:

```
docker.io/library/alpine:3.20          → sha256:d9e853e87e55…b6bc
public.ecr.aws/docker/library/alpine:3.20 → sha256:d9e853e87e55…b6bc   IDENTICAL
```

Both `application/vnd.oci.image.index.v1+json`, 16 entries, including the `unknown/unknown`
attestation manifests that buildx provenance emits. **ECR preserves OCI indexes with
attestations byte-for-byte.**

### One thing that could NOT be measured from the operator host

The WorkCaptain GHCR package is **private**, and the local `gh` token lacks `read:packages`:

```
UNAUTHORIZED: authentication required
```

So `SOURCE_MEDIA_TYPE` and `SOURCE_PLATFORM_SET` for *this* artifact are **not measurable here**.
They must be read at migration time by a credentialed identity (CI holds `packages: read` via
`github.token`). The guard does not depend on knowing them in advance — it asserts digest
equality on the actual copy — but the shape must be recorded in the evidence before the
production gate.

## Target configuration — from measured portfolio precedent

Siblings `societa-production` and `s2ppro-production` are identical: `IMMUTABLE`,
`scanOnPush: true`, `AES256`, no repository policy.

| | Value |
|---|---|
| `ECR_REPOSITORY_NAME` | `workcaptain-production` (precedent: `<product>-production`) |
| `ECR_REPOSITORY_URI` | `822127611052.dkr.ecr.eu-central-1.amazonaws.com/workcaptain-production` |
| `ECR_TAG_MUTABILITY` | `IMMUTABLE` |
| `ECR_SCAN_ON_PUSH` | `true` |
| `ECR_ENCRYPTION` | `AES256` |
| Repository policy | none |

### ⚠️ Lifecycle policy — a deliberate deviation from the sibling precedent

Both siblings carry:

```json
{"rulePriority":1,"description":"Expire untagged images after 14 days",
 "selection":{"tagStatus":"untagged","countType":"sinceImagePushed","countNumber":14},
 "action":{"type":"expire"}}
```

**That rule is hazardous for a digest-pinned runtime.** WorkCaptain's task definition references
the image by **digest**. The child manifests of an OCI index — including buildx attestation
manifests — are **untagged**. An untagged-expiry rule can therefore delete parts of the running
artifact, breaking both the runtime pull and the `:19` rollback, silently, weeks after cutover.

**Recommendation: do NOT apply rule 1 to this repository**, or apply it only with the production
digest guaranteed to remain tagged. This is flagged rather than copied, because inheriting a
sibling's policy without re-deriving it against *this* runtime's pull model is how the original
WC-003 class of defect arises.

Sponsor disposition required before the repository is created.

## CI push authority — no long-lived AWS key

Precedent: `societa-ci-ecr-push`, `s2ppro-ci-ecr-push` — OIDC-federated, short-lived STS.

```
ROLE_NAME        workcaptain-ci-ecr-push
TRUST            Federated: arn:aws:iam::822127611052:oidc-provider/token.actions.githubusercontent.com
                 sts:AssumeRoleWithWebIdentity
                 aud = sts.amazonaws.com
                 sub LIKE repo:Maqaleed-Digital/pro-work:*
PERMISSIONS      ecr:GetAuthorizationToken on *
                 ecr:UploadLayerPart, PutImage, InitiateLayerUpload,
                 CompleteLayerUpload, BatchCheckLayerAvailability
                 scoped to arn:aws:ecr:eu-central-1:822127611052:repository/workcaptain-production
```

## Planned AWS mutations — GENERATED, NOT EXECUTED

Each is **G1/G3** and stops here.

```
aws ecr create-repository \
  --repository-name workcaptain-production \
  --image-tag-mutability IMMUTABLE \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256 \
  --region eu-central-1

aws iam create-role --role-name workcaptain-ci-ecr-push \
  --assume-role-policy-document file://trust.json
aws iam put-role-policy --role-name workcaptain-ci-ecr-push \
  --policy-name workcaptain-ci-ecr-push --policy-document file://push.json
```

| RESOURCE_TYPE | RESOURCE_NAME | REGION | CREATED_OUTSIDE_TERRAFORM | RECONCILIATION_REQUIRED |
|---|---|---|---|---|
| `AWS::ECR::Repository` | `workcaptain-production` | eu-central-1 | **YES** | **LATER** |
| `AWS::IAM::Role` | `workcaptain-ci-ecr-push` | global | **YES** | **LATER** |
| `AWS::IAM::RolePolicy` | `workcaptain-ci-ecr-push` | global | **YES** | **LATER** |

`TF_APPLY_AUTHORIZED = NO`. Terraform remains stale and non-authoritative; nothing here
pretends otherwise.

## Cutover sequence — prepared, not executed

The first ECR push and the first ECR runtime pull must **not** be the same unrecoverable act.

1. Create ECR repository + CI OIDC push role *(G1/G3)*
2. **Copy** the accepted GHCR artifact → ECR (`skopeo copy --all` preferred; `crane copy` alternative)
3. Read the target ECR manifest digest
4. **Require `SOURCE == TARGET`** — stop if not
5. Capture the scan result; record source media type and platform set
6. Re-read live `workcaptain:19`
7. Clone the live task definition
8. Patch **repository identity only**, digest unchanged
9. Remove `repositoryCredentials`
10. Run `REGISTRY_MIGRATION` guard — require PASS, exactly 2 deltas
11. Register candidate *(G1)*
12. Read back the registered revision and re-guard
13. `update-service` with the explicit returned ARN — **never** `--force-new-deployment`
14. Witness the ECS pull **from ECR**
15. Prove the running digest is still `sha256:760bca14…df13`
16. Health / CSP / HSTS / Arabic / nav acceptance
17. Keep `:19` ready for explicit rollback
18. **Only after acceptance:** mark WC-004 superseded; retire the GHCR secret separately

**Do not delete the GHCR package or the GHCR secret during migration.**

## Guard profile

`REGISTRY_MIGRATION` permits exactly two semantic deltas and nothing else:

1. image repository identity GHCR → the **approved** ECR repository, **digest identical**
2. `repositoryCredentials` **present → absent** (removed, never swapped)

`IMAGE_ONLY` and `ENV_ADDITION_ONLY` are untouched and **both reject** this candidate —
verified by NC-ECR-10 and NC-ECR-11. Profiles narrow the permitted delta; they never widen
each other.

Controls armed by perturbation: neutering digest equality → 1 red; the credential-removal check
→ 2; the approved-target check → 1; the structural diff → 1 (NC-ECR-12, which exists precisely
because the first perturbation run showed the diff layer was otherwise unexercised).
