# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM base AS build
RUN npm ci --workspace @finanzas/api --workspace @finanzas/shared --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# prisma generate no se conecta a la base, pero la configuración exige la variable.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build --workspace @finanzas/api

FROM base AS prod-deps
RUN npm ci --omit=dev --workspace @finanzas/api && npm cache clean --force

FROM node:22-alpine AS runtime
ENV NODE_ENV=production TZ=America/Bogota
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/package.json apps/api/prisma.config.ts ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["sh", "-c", "node ../../node_modules/prisma/build/index.js migrate deploy && node dist/server.js"]
