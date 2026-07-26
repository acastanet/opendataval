FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm@11.10.0
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/map-service/package.json apps/map-service/package.json
RUN pnpm install --filter map-service... --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/map-service apps/map-service
RUN pnpm --filter map-service run sync:vendor
WORKDIR /app/apps/map-service
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
