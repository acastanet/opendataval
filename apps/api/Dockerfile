FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm@11.10.0

COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter api...

COPY packages/shared packages/shared
COPY apps/api apps/api
COPY db/migrations db/migrations

WORKDIR /app/apps/api
ENV MIGRATIONS_DIR=/app/db/migrations
EXPOSE 3000
CMD ["pnpm", "start"]
