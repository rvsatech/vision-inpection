# syntax=docker/dockerfile:1
# Contexto de build: raiz do monorepo  →  docker build -f apps/web/Dockerfile --build-arg API_URL=http://api:4000 .
FROM node:22-slim AS build
WORKDIR /repo
# As rewrites (/api/* → API) são resolvidas no build do Next.
ARG API_URL=http://api:4000
ARG NEXT_PUBLIC_DEMO_MODE=false
ENV API_URL=$API_URL NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --include-workspace-root --ignore-scripts
COPY apps/web ./apps/web
RUN npm run build -w apps/web

FROM node:22-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
