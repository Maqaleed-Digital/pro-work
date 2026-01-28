# Sprint S8 Closure — Security & Release Hygiene

## Scope
Security + release hygiene baseline for ProWork repository:
- CI gate
- CodeQL
- Dependabot
- Local hygiene scripts (no-op when non-Node repo)
- Secret scanning (Gitleaks)
- Branch protection SOP

## Commits (this sprint)
- e339636 — S8: security + release hygiene (CI, CodeQL, Dependabot, scripts, docs)
- 4de3260 — S8: add secret scanning (gitleaks config, script, CI)
- 404453f — S8: document branch protection SOP

## Artifacts Added / Updated
### GitHub Actions
- .github/workflows/ci.yml
- .github/workflows/codeql.yml
- .github/workflows/secret-scan.yml

### Dependency automation
- .github/dependabot.yml

### Security governance
- docs/SECURITY.md
- docs/BRANCH_PROTECTION.md

### Release governance
- docs/RELEASE_CHECKLIST.md

### Local scripts
- scripts/release_gate.sh
- scripts/security_audit.sh
- scripts/secret_scan.sh

### Repo hygiene
- .gitleaks.toml
- .gitignore updated for secret material + evidence handling

## Evidence (local, not committed)
Evidence folder is intentionally ignored by git.
Latest local evidence run folder example:
- /Users/waheebmahmoud/dev/pro-work/evidence/sprintS8/20260128T175234Z
Includes:
- release_gate.log (expected no-op when no package.json)
- security_audit.log (expected no-op when no package.json)

## Exceptions (Accepted)
- Repo has no package.json → npm-based lint/typecheck/test/audit are not applicable.
  - CI and scripts are defensive and do not fail the pipeline for missing package.json.
  - Classification: non-applicable runtime check; controls still valid for future Node addition.

## Closure Status
- S8 Controls Implemented: PASS
- Evidence Strategy: PASS (local evidence, tracked closure record)
- Ready for merge to main/master after branch protection enabled in GitHub UI.
