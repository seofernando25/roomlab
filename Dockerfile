# syntax=docker/dockerfile:1
ARG BUN_VERSION=1.3.14

FROM oven/bun:${BUN_VERSION} AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM install AS build
COPY . .
RUN bun test
RUN bun run build

FROM base AS dev
USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium
USER bun
WORKDIR /workspaces/habbo-clone
CMD ["sleep", "infinity"]

FROM oven/bun:${BUN_VERSION}-slim AS production
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    ROOMLAB_DB=/app/data/roomlab.sqlite \
    TRUST_PROXY=1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=6 \
  CMD ["bun", "-e", "const r=await fetch('http://127.0.0.1:3000/api/health');if(!r.ok)process.exit(1)"]
CMD ["bun", "run", "server/index.ts"]
