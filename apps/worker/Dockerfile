FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm@11.10.0

COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --filter worker...

COPY packages/shared packages/shared
COPY apps/worker apps/worker
COPY db/migrations db/migrations

WORKDIR /app/apps/worker
ENV MIGRATIONS_DIR=/app/db/migrations
CMD ["pnpm", "start"]
