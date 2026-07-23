FROM node:22-alpine AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY services/weather-vigilance/package.json services/weather-vigilance/package.json
WORKDIR /app/services/weather-vigilance
RUN npm install
COPY services/weather-vigilance /app/services/weather-vigilance
RUN npm run build

FROM node:22-alpine
WORKDIR /app/services/weather-vigilance
COPY services/weather-vigilance/package.json ./package.json
RUN npm install --omit=dev
COPY --from=build /app/services/weather-vigilance/dist ./dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
