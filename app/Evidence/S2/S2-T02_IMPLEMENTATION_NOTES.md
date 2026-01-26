# S2-T02 — RequestId Propagation

## Scope delivered
- Request-scoped context using AsyncLocalStorage
- Express middleware assigns/propagates requestId:
  - Reads `x-request-id` header if present
  - Otherwise generates a requestId
  - Echoes requestId in response header `x-request-id`
- Audit events auto-attach requestId:
  - If caller provides requestId, it is used
  - Else audit reads requestId from request context

## Evidence
- Server run log
- Health check response headers show x-request-id
