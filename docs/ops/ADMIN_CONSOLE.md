# ProWork Admin Console

## Development

Backend:
```
node app/server.js
```

Frontend:
```
cd app/frontend
npm run dev
```

UI:
```
http://localhost:5173
```


## Production

Build UI:
```
npm run build:ui
```

Run server:
```
node app/server.js
```

Admin console:
```
http://localhost:3010/admin
```


## Auth

Use an admin token:
```
Authorization: Bearer <TOKEN>
```


## Health checks

```
/api/admin/version
/api/admin/health
/api/admin/scheduler/status
/api/admin/evidence
```


## Troubleshooting

Check runtime:
```
bash scripts/prowork_doctor.sh
```
