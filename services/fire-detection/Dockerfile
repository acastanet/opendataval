FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY services/fire-detection/package.json services/fire-detection/package.json
WORKDIR /app/services/fire-detection
RUN npm install
COPY services/fire-detection /app/services/fire-detection
RUN npm run build

FROM node:22-alpine
WORKDIR /app/services/fire-detection
COPY services/fire-detection/package.json ./package.json
RUN npm install --omit=dev
COPY --from=build /app/services/fire-detection/dist ./dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
