# WORKCAPTAIN — SLO AND ALERT BASELINE

Version: 1.0  
Status: ACTIVE

## 1. Purpose

Define an initial reliability baseline appropriate for a newly live controlled public system.

## 2. Initial SLO Framing

This phase establishes baseline monitoring posture, not a mature SRE program.

Recommended initial framing:

- Public API health availability target: 99.5% baseline
- Uptime failure should alert immediately within practical platform limits
- Repeated backend failure signals should alert

## 3. Minimum Alert Baseline

Required:

### Alert A — Public Health Uptime Failure
Signal:
- uptime check failure for `https://api.workcaptain.ai/health`

### Alert B — Cloud Run Error / Failure Signal
Signal:
- backend service failure condition, elevated error indication, or no-ready condition captured through available monitoring baseline

## 4. Future Expansion

Future phases may extend into:

- latency SLO
- 5xx error ratio SLO
- structured dashboards
- traces
- error budget policy
- escalation routing and on-call
