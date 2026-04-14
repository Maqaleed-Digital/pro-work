# WORKCAPTAIN — RUNTIME ANALYTICS WIRING PROTOCOL
#
# Status: ACTIVE CONTRACT

## 1. Purpose

This protocol governs how runtime analytics may be wired into WorkCaptain.

## 2. No-Guessing Rule

No code file may be mutated unless it is first identified as a registered target in:
- config/analytics/runtime_activation_targets.json

## 3. Runtime Wiring Layers

### Frontend Layer
Purpose:
emit governed frontend events through one analytics abstraction.

Accepted target classes:
- app shell
- route change hook
- analytics abstraction module
- auth success handler
- primary action completion handler

### API Layer
Purpose:
emit governed API instrumentation events.

Accepted target classes:
- request middleware
- response middleware
- latency timing middleware
- centralized error handler

### Platform Layer
Purpose:
emit governed execution and trust events into analytics-compatible streams.

Accepted target classes:
- domain event publisher
- trust processor
- evidence pack completion hook
- AI completion hook

## 4. Activation Rule

Runtime activation is considered ready only when:

- target paths are registered
- event families are already in registries
- required environment variables are present
- downstream query definitions are present

## 5. Fail-Closed Rule

If any required target is missing, runtime activation must halt and record a blocked state in evidence.

## 6. Audit Rule

Every runtime activation attempt must produce:
- discovered target inventory
- missing target inventory
- env check output
- readout attempt result
