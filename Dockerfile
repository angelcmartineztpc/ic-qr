# syntax=docker/dockerfile:1
#
# Bun como gestor de paquetes; Node 24 para build y runtime (docs/ARCHITECTURE.md §S11, D7).
# En oven/bun, `node` es un alias de Bun, por eso se copia el binario de Bun a una
# imagen de Node en lugar de construir sobre oven/bun.
# Imágenes fijadas por digest (2026-10-06). Actualizar con:
#   docker buildx imagetools inspect <imagen> --format '{{json .Manifest.Digest}}'
#
# Antes de construir: `bun run fonts:setup` (Gotham —interfaz— y Address Sans Pro Cd —piezas— no están en git; viajan en el contexto).

FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS bun

FROM node:24-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS builder
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN test -f assets/fonts/gotham/Gotham-Bold.woff2 && test -f assets/fonts/address-sans/AddressSansPro-CdSemibold.woff2 \
  || (echo "Faltan las fuentes (Gotham y Address Sans Pro Cd): ejecuta 'bun run fonts:setup' antes de docker build" && exit 1)
# next build se ejecuta con el node del PATH (Node 24 real).
RUN bun run build

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# Archivos de la app propiedad de root y de solo lectura; solo /app/.data es escribible.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/assets/fonts ./assets/fonts
RUN mkdir -p /app/.data/storage && chown -R node:node /app/.data
VOLUME ["/app/.data"]
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
