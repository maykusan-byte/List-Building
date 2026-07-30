import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['data/master_warorgan.json'],
      manifest: {
        name: 'Warforge 40k',
        short_name: 'Warforge',
        description: 'Création locale de listes Warhammer 40,000.',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        lang: 'fr'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        maximumFileSizeToCacheInBytes: 45 * 1024 * 1024
      }
    })
  ],
  test: {
    environment: 'jsdom'
  }
});
