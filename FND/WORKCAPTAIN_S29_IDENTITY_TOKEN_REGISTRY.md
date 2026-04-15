# WORKCAPTAIN — S29 IDENTITY TOKEN REGISTRY

Version: 1.0
Status: LOCKED

---

## 1. INITIAL TOKEN CLASSES

| Token Class | Trigger Basis | Trust Requirement |
|---|---|---|
| PROJECT_COMPLETION_TOKEN | Trusted project/milestone completion | High |
| PHR_APPROVAL_TOKEN | Approved human review event | High |
| COMPLIANCE_VERIFICATION_TOKEN | Verified compliance completion or resolution | High |
| TEAM_LEADERSHIP_TOKEN | Verified leadership signal from trusted records | Medium/High |

---

## 2. TOKEN STATUS VALUES

- ISSUED
- REVOKED
- SUPERSEDED

---

## 3. REQUIRED TOKEN ATTRIBUTES

- token_id
- token_type
- owner_worker_id
- source_type
- source_id
- evidence_ref
- status
- issued_at
- metadata

---

## 4. HARD RULES

1. Every token must have a source.
2. Every token must be explainable.
3. Every token must be tenant-safe.
4. Every token must be auditable.
5. Replay must not duplicate tokens.
