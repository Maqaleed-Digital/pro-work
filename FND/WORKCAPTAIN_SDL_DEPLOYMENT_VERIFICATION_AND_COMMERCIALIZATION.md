# WORK CAPTAIN — SDL DEPLOYMENT VERIFICATION + DEMO NARRATIVE + PREMIUM PRICING

Version: 1.0  
Status: ACTIVE  
Applies From Commit: ff32f56

## 1. Purpose

This document operationalizes the Sovereign Differentiation Layer after SDL completion.  
It defines:

- deployment verification checklist
- canonical demo narrative
- premium pricing structure
- evidence requirements
- commercial positioning discipline

This package is governed by the pushed commit and its resulting evidence directory.

## 2. Source of Truth

- Code source of truth: pushed commit after this execution
- Prior SDL baseline: ff32f56
- Verification target: live deployment at `WC_LIVE_BASE_URL`
- Evidence location: `/Users/waheebmahmoud/dev/pro-work/evidence/phase_sdl_commercialization_<timestamp>`

## 3. Deployment Verification Checklist

### 3.1 Required public routes

English:
- `/`
- `/control-tower`
- `/operations`
- `/verticals`
- `/onboarding`
- `/workforce`
- `/compliance`
- `/executive-intelligence`

Arabic:
- `/ar`
- `/ar/control-tower`
- `/ar/operations`
- `/ar/verticals`
- `/ar/onboarding`
- `/ar/workforce`
- `/ar/compliance`
- `/ar/executive-intelligence`

### 3.2 Required verification checks

For each route:
- returns HTTP 200
- HTML contains `Work Captain`
- HTML contains at least one SDL nav target
- route is reachable without broken response
- Arabic routes expose `dir="rtl"` or Arabic path-specific surface markers where applicable

SDL-specific pages must verify:
- workforce page contains workforce markers
- compliance page contains compliance markers
- executive-intelligence page contains executive markers

### 3.3 SDL data markers

Workforce:
- `42`
- `18`
- `9`
- `1.2M SAR`
- `78%`

Compliance:
- `Green`
- `92%`
- `2`
- `5`

Executive:
- `84%`
- `91%`
- `Low`

## 4. Canonical Demo Narrative

### 4.1 Demo objective

Show Work Captain as a sovereign-ready operating system for workforce, compliance, and AI-governed execution in KSA.

### 4.2 Canonical route sequence

Primary English demo:
1. `/`
2. `/control-tower`
3. `/workforce`
4. `/compliance`
5. `/executive-intelligence`

Primary Arabic demo:
1. `/ar`
2. `/ar/control-tower`
3. `/ar/workforce`
4. `/ar/compliance`
5. `/ar/executive-intelligence`

### 4.3 Screen-by-screen narrative

#### Screen 1 — Landing
Narrative:
Work Captain is not another productivity tool. It is an operating system for governing work, workforce, and AI execution.

Proof points:
- enterprise positioning
- bilingual readiness
- KSA/GCC market posture

#### Screen 2 — Control Tower
Narrative:
This is the executive layer. Leadership sees delivery, operations, trust, and control in one place.

Proof points:
- governance-first design
- operational overview
- board-level visibility

#### Screen 3 — Workforce
Narrative:
We unify internal employees, freelancers, and AI into one controllable workforce model.

Proof points:
- FTE, freelancer, and AI visibility
- allocation and utilization
- cost-aware workforce control

Commercial message:
This replaces fragmented spreadsheets and disconnected staffing views with one executive surface.

#### Screen 4 — Compliance
Narrative:
This is where Work Captain becomes sovereign-differentiated for Saudi Arabia.

Proof points:
- Nitaqat posture preview
- WPS readiness
- compliance risk flags
- probation oversight

Commercial message:
The product does not just track work. It helps leadership manage compliance exposure and workforce readiness.

#### Screen 5 — Executive Intelligence
Narrative:
This layer converts raw operations into decision-grade signals.

Proof points:
- workforce efficiency score
- compliance score
- risk level
- AI recommendations

Commercial message:
Executives do not buy dashboards. They buy decision confidence.

### 4.4 Closing line

Work Captain gives Saudi and GCC organizations one governed system to control workforce allocation, compliance readiness, and AI-assisted execution.

## 5. Premium Pricing Structure

### 5.1 Pricing principles

- price on control, not seats alone
- sovereign features justify premium
- AI governance and compliance intelligence are premium levers
- enterprise onboarding and evidence discipline are monetizable

### 5.2 Commercial packages

#### Package A — Core
Target:
small teams, pilot customers, early adopters

Includes:
- landing platform access
- control tower baseline
- operations layer
- onboarding flow
- basic bilingual UI

Commercial intent:
entry product for initial adoption

Recommended list price:
- 12,000 SAR setup
- 3,500 SAR monthly

#### Package B — Control
Target:
mid-market firms, consulting groups, operationally complex teams

Includes everything in Core plus:
- workforce dashboard
- executive dashboards
- utilization and allocation visibility
- premium demo support
- enhanced governance reporting

Commercial intent:
default paid package for serious operators

Recommended list price:
- 25,000 SAR setup
- 9,000 SAR monthly

#### Package C — Sovereign
Target:
enterprise, public-sector-adjacent, Saudi-first employers, regulated or compliance-sensitive buyers

Includes everything in Control plus:
- compliance control center
- sovereign positioning pack
- executive intelligence layer
- premium AI insight surfaces
- audit/evidence-oriented operating model
- white-glove onboarding and executive rollout support

Commercial intent:
flagship package with maximum pricing power

Recommended list price:
- 60,000 SAR setup
- 20,000 SAR monthly

### 5.3 Pilot conversion rule

Pilot offer:
- maximum 6 to 8 weeks
- paid, not free
- credited toward annual contract if converted

Recommended pilot commercial terms:
- 18,000 SAR fixed pilot fee for Control scope
or
- 35,000 SAR fixed pilot fee for Sovereign scope

Conversion rule:
pilot fee credited against annual contract only if contract is signed within agreed post-pilot window.

### 5.4 Discount discipline

Allowed:
- annual prepay discount capped at 10%
- logo/reference rights can justify structured value trade
- first strategic lighthouse customer can receive controlled concession

Not allowed:
- free sovereign features
- open-ended pilots
- deep discounts before executive sponsor validation

## 6. Commercial Positioning Statements

### 6.1 One-line positioning
Work Captain is the sovereign workforce operating system for KSA-ready execution.

### 6.2 Three-pillar value message
- control the workforce
- strengthen compliance readiness
- govern AI-assisted execution

### 6.3 Executive-level message
Organizations do not need more software noise. They need one governed operating layer for workforce, compliance, and execution.

## 7. Evidence Requirements

This pack is not complete unless evidence contains:
- live route verification results
- HTML marker verification results
- demo sequence record
- pricing document snapshot
- final execution status file

## 8. Acceptance Criteria

This commercialization pack is complete only if:
- all required English and Arabic routes return HTTP 200
- SDL pages expose expected markers
- evidence directory is generated
- commercialization document exists in `FND`
- verification script exists in `scripts`
- pushed commit is captured in evidence

