# Produktions-Image für Clover Japan (Self-Hosting, z. B. CasaOS).
# Multi-Stage: Abhängigkeiten -> Build -> schlankes Standalone-Runtime.
# Separates "migrator"-Target führt beim Start `prisma migrate deploy` aus.

# ---- Basis: Node + openssl (von Prisma benötigt) ----
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- Abhängigkeiten (inkl. dev, für Build & Migrationen) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
FROM deps AS builder
COPY . .
# Prisma-Client generieren, dann Produktions-Build (Standalone-Output).
RUN npx prisma generate && npm run build

# ---- Migrator: wendet Migrationen an (eigener One-Shot-Container) ----
# Nutzt die vollen deps inkl. Prisma-CLI; braucht nur Schema + Migrationen.
FROM deps AS migrator
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- Runtime: schlankes Standalone-Bundle ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Nicht als root laufen.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone-Server + statische Assets + public/.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Prisma-Engine sicher mitnehmen (Next-Tracing lässt sie gelegentlich aus).
COPY --from=builder /app/node_modules/.prisma/client ./node_modules/.prisma/client
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
