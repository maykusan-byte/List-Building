import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const base = mode === 'github-pages' ? '/List-Building/' : '/';

  return {
    base,
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['data/catalog.json', 'data/locales/fr/catalog.json', 'data/datasheet_x_figs.csv', 'data/unit-images.json', 'data/rules/core-rules-fr.json'],
        manifest: {
          name: 'Warforge 40k',
          short_name: 'Warforge',
          description: 'Création locale de listes Warhammer 40,000.',
          theme_color: '#101827',
          background_color: '#101827',
          display: 'standalone',
          lang: 'fr',
          scope: base,
          start_url: base
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,json,csv}'],
          maximumFileSizeToCacheInBytes: 45 * 1024 * 1024
        }
      })
    ],
    test: {
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.mjs']
    }
  };
});
