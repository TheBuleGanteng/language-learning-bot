# =============================================================================
# Multi-stage Dockerfile for production builds. The app is published as a
# Next.js standalone bundle; nginx (running in the parent vm-infrastructure
# stack) reverse-proxies to it under the /language-learning sub-path.
#
# Build args (passed from vm-infrastructure docker-compose):
#   NEXT_PUBLIC_BASE_PATH  sub-path the app is served under (inlined at build)
#   WEB_BASEPATH           alias kept for parity with sibling apps; falls back
#                          into NEXT_PUBLIC_BASE_PATH when the latter is unset
#   GCP_DEPLOYMENT         marker available to the build for conditional logic
# =============================================================================

# --- deps ----------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# libc6-compat for prebuilt musl binaries (sharp, @node-rs/argon2); the
# python3/make/g++ toolchain is a safety net for any dep that has to compile
# from source. None of this lands in the final image.
RUN apk add --no-cache libc6-compat python3 make g++
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# --- build ---------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ARG WEB_BASEPATH=/language-learning
ARG NEXT_PUBLIC_BASE_PATH=/language-learning
ARG GCP_DEPLOYMENT=true
# next.config.ts reads NEXT_PUBLIC_BASE_PATH; honor WEB_BASEPATH as a fallback
# so either build arg works.
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH:-$WEB_BASEPATH}
ENV WEB_BASEPATH=${WEB_BASEPATH}
ENV GCP_DEPLOYMENT=${GCP_DEPLOYMENT}
RUN corepack enable && pnpm build

# --- run -----------------------------------------------------------------
FROM node:22-alpine AS run
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
