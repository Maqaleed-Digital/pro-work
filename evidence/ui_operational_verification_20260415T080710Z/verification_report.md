# UI Operational Verification Report

- Base URL: http://127.0.0.1:3401
- Frontend Root: /Users/waheebmahmoud/dev/pro-work/prowork_runtime/web
- Router Mode: app
- Overall Status: PASS

## Live Route Wrapper Checks
- / :: status=200 iframeOk=true pass=true latencyMs=79
- /control-tower :: status=200 iframeOk=true pass=true latencyMs=25
- /operations :: status=200 iframeOk=true pass=true latencyMs=31
- /verticals :: status=200 iframeOk=true pass=true latencyMs=22
- /onboarding :: status=200 iframeOk=true pass=true latencyMs=21

## Static Page Surface Checks
- /prowork-wave1/index.html :: status=200 pass=true markerMisses=0 navMisses=0 latencyMs=11
- /prowork-wave1/control-tower.html :: status=200 pass=true markerMisses=0 navMisses=0 latencyMs=6
- /prowork-wave1/operations.html :: status=200 pass=true markerMisses=0 navMisses=0 latencyMs=5
- /prowork-wave1/verticals.html :: status=200 pass=true markerMisses=0 navMisses=0 latencyMs=6
- /prowork-wave1/onboarding.html :: status=200 pass=true markerMisses=0 navMisses=0 latencyMs=6

## Asset Checks
- /prowork-wave1/styles.css :: status=200 pass=true latencyMs=5
- /prowork-wave1/app.js :: status=200 pass=true latencyMs=4
- /prowork-wave1/index.html :: status=200 pass=true latencyMs=4
- /prowork-wave1/control-tower.html :: status=200 pass=true latencyMs=3
- /prowork-wave1/operations.html :: status=200 pass=true latencyMs=5
- /prowork-wave1/verticals.html :: status=200 pass=true latencyMs=4
- /prowork-wave1/onboarding.html :: status=200 pass=true latencyMs=4

## Concurrency
- requests=96
- failures=0
- avgMs=65
- maxMs=120
