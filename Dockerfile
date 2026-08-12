# Kibana Banking MCP Server — remote (HTTP) endpoint image.
#
# Build:  docker build -t kibana-banking-mcp .
# Run:    docker run -p 3000:3000 --env-file .env kibana-banking-mcp
#
# Requires at runtime: KIBANA_URL, KIBANA_API_KEY, and MCP_AUTH_TOKEN
# (or MCP_ALLOW_ANONYMOUS=true for local development only).

# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Run as the built-in non-root user.
USER node

ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/http.mjs"]
