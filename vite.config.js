import { defineConfig } from "vite";
import { resolve } from "node:path";

// Le site (accueil, roue, 404) vit dans site/. Les apps ne passent pas par Vite :
// scripts/build.mjs les copie telles quelles dans dist/apps/.
export default defineConfig({
  root: "site",
  publicDir: "public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "site/index.html"),
        roue: resolve(import.meta.dirname, "site/roue/index.html"),
        notfound: resolve(import.meta.dirname, "site/404.html"),
        legal: resolve(import.meta.dirname, "site/mentions-legales/index.html"),
        stats: resolve(import.meta.dirname, "site/stats/index.html"),
      },
    },
  },
  server: {
    // En dev, l'API tourne dans `npm run preview` (wrangler dev, port 8787).
    proxy: { "/api": "http://localhost:8787" },
  },
});
