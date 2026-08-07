FROM node:22-alpine
WORKDIR /app
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=10000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=300000 \
    npm_config_store_dir=/pnpm/store
RUN npm install -g pnpm@11.10.0

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/gateway-service/package.json apps/gateway-service/package.json
RUN --mount=type=cache,id=opendataval-pnpm-v11,target=/pnpm/store,sharing=locked \
    pnpm install --filter gateway-service... --frozen-lockfile --prefer-offline

COPY apps/gateway-service apps/gateway-service

WORKDIR /app/apps/gateway-service
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
