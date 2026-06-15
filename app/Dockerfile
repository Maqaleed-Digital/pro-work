FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm install --production --frozen-lockfile

# Copy application source
COPY . .

# Ensure frontend dist is present
# (must be built before docker build runs)
RUN test -f frontend/dist/index.html || \
    (echo "ERROR: frontend/dist not built. Run npm run build in app/frontend/ first." && exit 1)

# Cloud Run requires port 8080
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

CMD ["node", "server.js"]
