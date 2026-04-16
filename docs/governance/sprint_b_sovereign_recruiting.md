# PROWORK — Sprint B / Sovereign Recruiting (BRD V3 Final)

## Status
READY FOR EXECUTION

## Baseline
- Phase 1 commit: 5ff7de2
- Sprint A commit: f53327c

## Scope
- Candidate profiles (FTE and FREELANCER types)
- Requisitions with configurable status FSM
- Skill graph scoring (overlap-based, case-insensitive normalisation)
- Internal-first talent matching (FTE priority boost)
- Nitaqat impact preview (Saudi nationality weighting, override-aware)
- Occupation match validation (prohibited titles, credential checks)
- AI explanation logging (reviewer-required flag)
- Shortlist workflow (CANDIDATE_SHORTLISTED trust-sensitive event)
- Recruiting router (handle pattern)
- Evidence runner

## Event Types (BRD V3)

| Event | Trust Sensitive | Trust Level |
|---|---|---|
| CANDIDATE_CREATED | No | STANDARD |
| CANDIDATE_UPDATED | No | STANDARD |
| REQUISITION_CREATED | No | STANDARD |
| REQUISITION_STATUS_CHANGED | No | STANDARD (HIGH when FILLED) |
| CANDIDATE_MATCHED | No | STANDARD |
| CANDIDATE_SHORTLISTED | **Yes** | HIGH |
| NITAQAT_PREVIEW_GENERATED | **Yes** | HIGH |
| OCCUPATION_MATCH_VALIDATED | **Yes** | HIGH |
| AI_MATCH_EXPLANATION_LOGGED | **Yes** | HIGH |

Trust-sensitive justification: NITAQAT_PREVIEW_GENERATED, OCCUPATION_MATCH_VALIDATED, and AI_MATCH_EXPLANATION_LOGGED are high-impact recruiting recommendations and compliance-facing evaluations that require explanation and evidence logging. CANDIDATE_SHORTLISTED records a gated personnel decision.

## SQL Tables

| Table | Purpose |
|---|---|
| candidates | Candidate profiles |
| candidate_skills | Skill index per candidate |
| requisitions | Open/closed job requisitions |
| requisition_required_skills | Required skills per requisition |
| candidate_matches | AI match output per candidate-requisition pair |
| candidate_shortlists | Shortlist decisions with reviewer outcomes |
| recruiting_ai_decisions | Full AI decision audit trail |

## Locked Constraints
- FTE lifecycle includes requisitions and recruiting pipeline
- Internal talent marketplace searches FTE first, freelancers second
- Nitaqat preview must be explainable and override-aware
- Occupation validation must flag prohibited titles and missing credentials
- AI outputs must be logged with reviewer outcomes
- Policy rules treated as configurable assets, not legal truth

## Gate Targets
- G1 Quality: recruiting test pack passes
- G2 Architecture: recruiting emits registered events only
- G3 Evidence: zip + sha256 + manifest generated
- G4 Governance: this page in Notion
- G5 CEO sign-off: commit hash reviewed

## Evidence Pack Target
EP-WOS-RECRUIT-01
Candidate evaluation + Nitaqat preview + occupation validation
