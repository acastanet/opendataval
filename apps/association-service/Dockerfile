FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm@11.10.0
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY apps/association-service/package.json apps/association-service/package.json
RUN pnpm install --filter association-service... --frozen-lockfile
COPY apps/association-service apps/association-service
WORKDIR /app/apps/association-service
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
