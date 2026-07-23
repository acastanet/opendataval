FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm@11.10.0
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/weather-service/package.json apps/weather-service/package.json
RUN pnpm install --filter weather-service... --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/weather-service apps/weather-service
WORKDIR /app/apps/weather-service
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
