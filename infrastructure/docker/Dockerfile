# ProWork API Server
FROM node:20-alpine AS base

WORKDIR /app

RUN apk add --no-cache \
    postgresql-client \
    curl \
    tini

COPY app/package*.json ./

RUN npm ci --only=production && npm cache clean --force

COPY app/ ./

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
