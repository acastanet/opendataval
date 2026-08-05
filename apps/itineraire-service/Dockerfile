FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm@11.10.0

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/itineraire-service/package.json apps/itineraire-service/package.json
RUN pnpm install --filter itineraire-service... --frozen-lockfile

COPY apps/itineraire-service apps/itineraire-service
WORKDIR /app/apps/itineraire-service
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
