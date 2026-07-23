FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm@11.10.0

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/geography-service/package.json apps/geography-service/package.json
RUN pnpm install --filter geography-service... --frozen-lockfile

COPY apps/geography-service apps/geography-service

WORKDIR /app/apps/geography-service
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
