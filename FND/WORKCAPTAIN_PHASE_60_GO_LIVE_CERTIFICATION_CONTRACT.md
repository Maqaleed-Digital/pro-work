# WORKCAPTAIN / PROWORK — PHASE 60 GO-LIVE CERTIFICATION CONTRACT

## Certification prerequisites
Go-live certification is allowed only when:
- live verification passed
- deployment status = LIVE_VERIFIED
- production verification evidence exists
- certification timestamp is persisted

## Certification outputs
- deploymentStatus = LIVE_VERIFIED
- liveVerification = PASS
- goLiveCertification = ISSUED
- certifiedAt timestamp persisted
- verification evidence path persisted

## Runtime derivation rule
Mounted runtime must derive go-live certification from persisted production verification state only.
