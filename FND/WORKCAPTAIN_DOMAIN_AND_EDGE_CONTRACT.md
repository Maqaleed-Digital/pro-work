# WORKCAPTAIN — DOMAIN AND EDGE CONTRACT

Version: 1.0  
Status: ACTIVE  
Hostname: api.workcaptain.ai

## 1. Domain Contract

Primary public beta hostname:

- `api.workcaptain.ai`

No other hostname is considered canonical for Phase 5 public beta.

## 2. TLS Contract

- Managed certificate required
- HTTPS only
- HTTP requests redirected to HTTPS where supported
- Certificate must cover `api.workcaptain.ai`

## 3. Edge Components

- Global static IP
- Managed SSL certificate
- External HTTPS load balancer
- URL map
- Target HTTPS proxy
- Forwarding rule
- Backend service
- Serverless NEG
- Cloud Armor policy

## 4. Backend Contract

Approved backend target:

- the designated Cloud Run public API service for beta ingress

The edge must not point directly to:
- trust processor
- background worker
- internal-only orchestrator routes
- non-public operator services

## 5. Routing Contract

Default routing:
- all approved public traffic routes to the designated API backend

Optional future routing:
- path-based rules only after explicit governance update

## 6. DNS Contract

DNS must resolve `api.workcaptain.ai` to the reserved global IP of the load balancer.

## 7. No-Latest Rule

If edge deployment references image-based cutover coordination, immutable tags only.  
No `:latest` references are permitted in governed runtime promotion.
