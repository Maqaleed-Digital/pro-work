# WORKCAPTAIN — PHASE 7 SECURITY HARDENING + ROUTE GOVERNANCE

Version: 1.0  
Status: ACTIVE

## 1. Purpose

This phase enforces strict control over public exposure and removes unintended route accessibility.

## 2. Core Principle

Default state:
- DENY ALL

Allowed explicitly:
- /health
- explicitly approved API routes

Everything else:
- blocked or authenticated

## 3. Required Controls

### 3.1 Public Route Policy

Allowed:
- GET /health

Conditionally allowed:
- API endpoints (future controlled exposure)

Forbidden:
- /admin
- internal routes
- debug endpoints

### 3.2 Mandatory Implementation

The API service MUST:

- reject /admin unless authenticated
- return 403 or 401
- never expose admin functionality publicly

### 3.3 Identity Verification

Each service must return:

{
  "service": "<name>",
  "status": "ok"
}

## 4. Edge + App Responsibility Split

Edge (Cloud Armor):
- WAF
- rate limiting

Application:
- route-level access control
- authorization

## 5. Completion Gate

Phase 7 completes only when:

1. /admin is NOT publicly accessible
2. unauthorized routes return 403/401
3. /health remains accessible
4. no unintended endpoints exposed
