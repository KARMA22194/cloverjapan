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
#
# ⚠️ Die Vorbedingung wird hier geprüft, nicht Prisma überlassen. Fehlt
# `DIRECT_URL`, meldet Prisma nur „The datasource.url property is required in
# your Prisma config file" — das beschreibt die Config, nicht die Ursache, und
# schickt auf die Suche nach einem Fehler in `prisma.config.ts`, wo keiner ist.
FROM deps AS migrator
COPY prisma ./prisma
# ⚠️ `prisma.config.ts` MUSS mit. Seit Prisma 7 steht die Verbindungs-URL nicht
# mehr im Schema, sondern dort — ohne die Datei meldet `migrate deploy` nur
# „The datasource.url property is required in your Prisma config file" und
# schickt damit auf die Suche nach einer fehlenden Umgebungsvariablen, obwohl
# schlicht die Datei fehlt. Erkennbar ist das daran, dass die sonst übliche
# Zeile „Loaded Prisma config from prisma.config.ts." im Log ausbleibt.
COPY prisma.config.ts ./
# ⚠️ Auch die Pflegeskripte. `create-admin.mjs` ist auf einer Produktions-
# instanz ohne SMTP der einzige Weg zum ersten Konto: `/register` kann die
# Bestätigungsmail nicht versenden und antwortet mit 503, und ohne bestätigte
# Adresse ist der Login gesperrt.
COPY scripts ./scripts
# ⚠️ `prisma generate` ist hier Pflicht, obwohl `migrate deploy` ohne den
# generierten Client auskommt. `scripts/create-admin.mjs` importiert ihn aber —
# ohne Generierung ist `@prisma/client` nur ein CommonJS-Stub, und der Import
# scheitert mit „Named export 'PrismaClient' not found".
RUN npx prisma generate
CMD ["sh", "-c", "\
  if [ -z \"$DIRECT_URL\" ]; then \
    echo 'FEHLER: DIRECT_URL ist nicht gesetzt.' >&2; \
    echo 'Sie gehoert in die .env.prod und zeigt auf dieselbe Datenbank wie' >&2; \
    echo 'DATABASE_URL, z. B. postgresql://clover:PASSWORT@db:5432/clover?schema=public' >&2; \
    exit 1; \
  fi; \
  exec npx prisma migrate deploy"]

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
