# WORKCAPTAIN — AUTH AND ROUTE PROTECTION CONTRACT

Version: 1.0  
Status: ACTIVE

## 1. Route Protection Principle

Default posture for non-public operational routes:

- deny unless authenticated
- deny unless authorized where applicable

## 2. Required Protected Targets

The following route classes must be protected:

- admin route
- operator route
- identity/self route if used to resolve caller context
- any route that mutates protected system state

## 3. Required Public Target

The following route class remains public:

- health/liveness route required for uptime monitoring

## 4. Acceptance Rule

The system must demonstrate:

- unauthenticated request to protected route fails closed
- authenticated request to protected route succeeds under valid credential
- health route remains publicly reachable

## 5. Forbidden State

Forbidden:
- `/admin` returns `200` without auth
- identity endpoint returns caller data without auth
- public route changes that break monitoring baseline
