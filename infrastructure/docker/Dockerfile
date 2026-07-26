# ProWork API Server
#
# EC-001-3-IMG: multi-stage build. The runtime image serves the compiled Vite
# frontend from /app/frontend/dist. That dist is .gitignored and is NOT produced
# by copying host output — it is built here in the `frontend-build` stage from
# source and copied into the runtime stage, so the image CI builds
# (docker build -f infrastructure/docker/Dockerfile .) is always dist-complete.

# ── Stage 1: compile the Vite frontend (index.html landing + app.html SPA) ──
FROM node:20-alpine AS frontend-build

WORKDIR /build/app/frontend

# Deps first for layer caching (build tooling incl. vite is in devDependencies).
COPY app/frontend/package.json app/frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

# Frontend source (index.html, app.html, src/, public/, vite.config.js).
COPY app/frontend/ ./

# Canonical build → app/frontend/dist (base:'/'; multi-entry landing + app).
RUN npm run build

# Fail the image build if any required artifact is missing (no hard-coded hashes).
RUN test -f dist/app.html \
 && test -f dist/index.html \
 && test -d dist/assets \
 && ls dist/assets/app-*.js >/dev/null \
 && ls dist/assets/landing-*.js >/dev/null

# ── Stage 2: runtime (unchanged base/behavior + the compiled dist) ──
FROM node:20-alpine AS base

WORKDIR /app

RUN apk add --no-cache \
    postgresql-client \
    curl \
    tini

COPY app/package*.json ./

RUN npm ci --only=production && npm cache clean --force

COPY app/ ./

# Compiled frontend from the build stage (dist is .gitignored / never in context).
COPY --from=frontend-build /build/app/frontend/dist ./frontend/dist

# Fail the image build if the runtime image is missing the compiled frontend.
RUN test -f frontend/dist/app.html \
 && test -f frontend/dist/index.html \
 && test -d frontend/dist/assets

RUN addgroup -g 1001 -S prowork && \
    adduser -S prowork -u 1001 -G prowork && \
    chown -R prowork:prowork /app

USER prowork

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3010/api/admin/health || exit 1

ENV NODE_ENV=production
ENV APP_HOST=0.0.0.0
ENV APP_PORT=3010

EXPOSE 3010

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
