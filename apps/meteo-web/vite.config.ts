import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const gatewayProxyUrl = process.env.VITE_GATEWAY_PROXY_URL ?? "http://localhost:3000";

export default defineConfig({
  base: "/meteo-v2/",
  plugins: [react()],
  server: {
    port: 4322,
    strictPort: true,
    proxy: {
      "/api": gatewayProxyUrl,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
  },
});
