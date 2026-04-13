# PHASE 87 — WEB UI FOUNDATION + DOMAIN SPLIT + GLOBAL HTTPS LB CUTOVER

STATUS: PASS
DOMAIN_STRATEGY: GLOBAL_HTTPS_LOAD_BALANCER + SERVERLESS_NEG

SOURCE_UI=app/frontend
WEB_SERVICE=web-service
API_SERVICE=api-service

LB_IP=34.144.236.130
LB_CERT=workcaptain-cert
LB_URLMAP=workcaptain-urlmap

PUBLIC_WEB=https://workcaptain.ai
PUBLIC_WWW=https://www.workcaptain.ai
PUBLIC_API=https://api.workcaptain.ai

VALIDATION:
- https://workcaptain.ai -> 200
- https://www.workcaptain.ai -> 200
- https://workcaptain.ai/health -> 200
- https://api.workcaptain.ai/health -> 200
- https://api.workcaptain.ai/docs -> 200

RUNTIME:
- Temporary web validation passed on https://web-service-nwa6jq77aq-wx.a.run.app
- LB IP reserved: 34.144.236.130
- DNS A records cut to LB IP for all 3 domains
- Final API origin wired to https://api.workcaptain.ai
- Apex/www routed via LB -> web-service
- API subdomain routed via LB -> api-service
