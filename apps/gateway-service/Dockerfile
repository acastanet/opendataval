FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm@11.10.0

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/gateway-service/package.json apps/gateway-service/package.json
RUN pnpm install --filter gateway-service... --no-frozen-lockfile

COPY apps/gateway-service apps/gateway-service

WORKDIR /app/apps/gateway-service
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
