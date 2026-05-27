# =============================================================================
# Multi-stage Dockerfile for production builds. The app is published as a
# Next.js standalone bundle; nginx (running in the parent vm-infrastructure
# stack) reverse-proxies to it.
# =============================================================================

# --- deps ----------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# --- build ---------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_BASE_PATH=/language-learning
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
RUN corepack enable && pnpm build

# --- run -----------------------------------------------------------------
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# Migrations and drizzle config travel with the image so the operator can
# run `pnpm db:migrate` from inside the container before traffic is opened.
COPY --from=build /app/src/db/migrations ./src/db/migrations
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
