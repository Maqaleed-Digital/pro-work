# WORKCAPTAIN SECRET CONTRACT

Status: ACTIVE

Required runtime secrets:
- DB_PASSWORD
- REDIS_AUTH
- JWT_SECRET

Rules:
- never commit real values
- provision through Secret Manager only
- nonprod values separated from future prod values
