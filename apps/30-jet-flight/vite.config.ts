import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// Le jeu est construit dans dist/jouer/ ; la page de présentation (public/index.html) est copiée telle quelle.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    assetsInlineLimit: 4096,
    rollupOptions: { input: { jouer: resolve(__dirname, 'jouer/index.html') } },
  },
})
