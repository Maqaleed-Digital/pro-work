# Branch Protection SOP

## Target branches
- `main` (or `master`)

## Required settings (GitHub > Settings > Branches)
Enable:
- Require a pull request before merging
- Require approvals (min 1)
- Dismiss stale approvals
- Require status checks to pass before merging

## Required status checks
Require these checks:
- CI
- CodeQL
- Secret Scan (Gitleaks)

## Additional recommended controls
- Require conversation resolution before merging
- Require signed commits (if organization policy allows)
- Restrict who can push to matching branches
