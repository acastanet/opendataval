import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

export default defineConfig({
  integrations: [svelte()],
  output: "static",
  server: { host: true },
  vite: {
    server: {
      proxy: {
        "/api/v2/map": "http://localhost:3003",
        "/api": "http://localhost:3000",
      },
    },
  },
});
