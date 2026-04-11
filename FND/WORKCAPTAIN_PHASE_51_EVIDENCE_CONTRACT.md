# WORKCAPTAIN / PROWORK — PHASE 51 EVIDENCE CONTRACT

## Blocked path
- invalid intake returns HTTP 422
- certification creation against missing evidence pack returns HTTP 404
- unauthorized certification creation returns HTTP 403

## Active path
- valid intake returns HTTP 201
- advance to BOARD_REVIEW returns HTTP 200
- approve returns HTTP 200
- work item creation returns HTTP 201
- start returns HTTP 200
- complete returns HTTP 200
- delivery artifact creation returns HTTP 201
- evidence pack creation returns HTTP 201
- certification creation returns HTTP 201

## State validation
- intakes >= 1
- opportunities >= 1
- opportunity stage = APPROVED
- work items >= 1
- delivery artifacts >= 1
- evidence packs >= 1
- certifications >= 1
- events >= 22
