# WORKCAPTAIN — RUNTIME DEPLOY DISCOVERY PROTOCOL
#
# Status: ACTIVE CONTRACT

## 1. Purpose

This protocol governs safe discovery of the deployment target that controls runtime environment variables.

## 2. Allowed Target Classes

- cloud run deploy script
- gcloud deploy shell script
- docker compose env file for runtime deploy
- documented runtime deployment manifest

## 3. Discovery Rule

Exactly one deployment target must be discovered and patched.

## 4. Fail-Closed Rule

If zero or multiple ambiguous deployment targets are found, stop and record BLOCKED_AMBIGUOUS_DEPLOY_TARGET.
