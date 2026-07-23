FROM node:22-alpine
WORKDIR /app/services/weather-vigilance
COPY services/weather-vigilance/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY services/weather-vigilance/src ./src
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/index.ts"]
