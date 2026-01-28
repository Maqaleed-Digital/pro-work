# Release Checklist

## Pre-merge (PR)
- CI green (lint/typecheck/test)
- CodeQL checks clean (or documented accepted risk)
- No secrets committed (verify with repo scanning)
- Changelog/release notes updated if applicable

## Pre-release (local)
Run:
- `bash scripts/release_gate.sh`

Attach the generated evidence folder to the sprint evidence pack.

## Post-release
- Tag created (if you use tags)
- Deployment notes recorded
- Any incidents logged with follow-ups
