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
COPY apps/site-service/package.json apps/site-service/package.json
RUN --mount=type=cache,id=opendataval-pnpm-v11,target=/pnpm/store,sharing=locked \
    pnpm install --filter site-service... --frozen-lockfile --prefer-offline

COPY packages/shared packages/shared
COPY apps/site-service apps/site-service
COPY db/migrations db/migrations

WORKDIR /app/apps/site-service
ENV MIGRATIONS_DIR=/app/db/migrations
ENV SITE_SERVICE_INSTANCES_DIR=/data/instances
EXPOSE 3000
CMD ["pnpm", "start"]
