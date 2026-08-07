FROM node:22-alpine
WORKDIR /app
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=10000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=300000 \
    npm_config_store_dir=/pnpm/store
RUN npm install -g pnpm@11.10.0

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN --mount=type=cache,id=opendataval-pnpm-v11,target=/pnpm/store,sharing=locked \
    pnpm install --filter worker... --frozen-lockfile --prefer-offline

COPY packages/shared packages/shared
COPY apps/worker apps/worker
COPY db/migrations db/migrations

WORKDIR /app/apps/worker
ENV MIGRATIONS_DIR=/app/db/migrations
CMD ["pnpm", "start"]
