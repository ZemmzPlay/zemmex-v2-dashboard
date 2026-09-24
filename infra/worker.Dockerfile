# zemmz worker: plain Node run with tsx, no build step (as in the existing stack).
# Also runs database migrations on deploy: `docker compose run --rm worker npm run db:deploy`.
# Build from the repository root:  docker build -f infra/worker.Dockerfile -t zemmz-worker .

FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
# Full install: the worker needs tsx and the prisma CLI (for migrations).
# Pruning Next.js out of this image is a later optimisation.
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS run
RUN apk add --no-cache openssl && addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
COPY apps/worker ./apps/worker
COPY packages ./packages
RUN npx prisma generate --schema packages/db/prisma/schema.prisma && chown -R app:app /app
USER app
CMD ["node", "--import", "tsx", "apps/worker/src/index.ts"]
