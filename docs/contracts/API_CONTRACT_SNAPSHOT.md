# API Contract Snapshot — Sprint S7

## Base
- Service: pro-work
- Base URL: http://127.0.0.1:${APP_PORT}
- Default port: 3010
- Response: JSON only

## Common Response Fields
- ok: boolean
- requestId: string
- time: ISO string
- service: "pro-work"

## Endpoints

### GET /health
200
{ ok: true, service, time, requestId }

### GET /api/health
200
{ ok: true, service, time, requestId }

### GET /api/i18n/ping
Purpose: Validate locale detection + translation wiring
200
{
  ok: true,
  locale: "en" | "ar",
  dir: "ltr" | "rtl",
  message: string,
  requestId,
  time,
  service
}

### POST /api/loop/job
Purpose: Create a job in the demo loop
Request
{ title: string }
Responses
- 200 ok: true
- 400 validation_failed

### POST /api/loop/provider
Purpose: Create a provider in the demo loop
Request
{ name: string }
Responses
- 200 ok: true
- 400 validation_failed

### POST /api/loop/match
Purpose: Create a match between provider + job
Request
{ jobId: string, providerId: string }
Responses
- 200 ok: true
- 400 validation_failed
- 404 not_found

### POST /api/loop/complete
Purpose: Complete the assignment
Request
{ assignmentId: string }
Responses
- 200 ok: true
- 400 validation_failed
- 404 not_found

## Error Codes (Minimum)
- validation_failed
- unauthorized
- forbidden
- not_found
- conflict
