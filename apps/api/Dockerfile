# syntax=docker/dockerfile:1
# Contexto de build: raiz do monorepo  →  docker build -f apps/api/Dockerfile .
FROM node:22-slim AS deps
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/api --include-workspace-root --ignore-scripts

# Estágio com dependências de desenvolvimento: build da API e também usado
# pelo serviço "migrate" (prisma migrate deploy + seed).
FROM deps AS build
COPY packages ./packages
COPY services/vision/samples ./services/vision/samples
COPY apps/api ./apps/api
RUN npm run prisma:generate -w apps/api && npm run build -w apps/api \
    && mkdir -p /data/storage && chown node:node /data/storage
WORKDIR /repo/apps/api

FROM deps AS prod-deps
RUN npm prune --omit=dev --workspace apps/api --include-workspace-root --ignore-scripts

FROM node:22-slim AS runtime
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data/storage && chown node:node /data/storage
WORKDIR /repo
COPY --from=prod-deps --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /repo/apps/api/dist ./apps/api/dist
USER node
WORKDIR /repo/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD curl -fsS http://localhost:4000/health || exit 1
CMD ["node", "dist/main.js"]
