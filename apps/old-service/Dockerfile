FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm@11.10.0

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/old-service/package.json apps/old-service/package.json
RUN pnpm install --filter old-service... --frozen-lockfile

COPY apps/old-service apps/old-service

WORKDIR /app/apps/old-service
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
