import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

export default defineConfig({
  integrations: [svelte()],
  output: "static",
  server: { host: true },
  vite: {
    server: {
      proxy: {
        "/api": "http://localhost:3000",
      },
    },
  },
});
