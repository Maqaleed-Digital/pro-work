# WORKCAPTAIN — RUNTIME WIRING DISCOVERY PROTOCOL
#
# Status: ACTIVE CONTRACT

## 1. Purpose

This protocol governs safe runtime target discovery.

## 2. Discovery Rule

Exactly one target must be discovered for:
- frontend runtime surface
- backend/platform runtime surface

## 3. Fail-Closed Rule

If discovery is ambiguous or empty, stop and record blocked status.
