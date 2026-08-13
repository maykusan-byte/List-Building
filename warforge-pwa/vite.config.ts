import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const isDesktop = mode === 'desktop';
  const isAndroid = mode === 'android';
  const base = mode === 'github-pages' ? '/List-Building/' : isDesktop ? './' : '/';

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
        disable: isDesktop || isAndroid,
        registerType: 'autoUpdate',
        includeAssets: ['data/catalog.json', 'data/locales/fr/catalog.json', 'data/datasheet_x_figs.csv', 'data/unit-images.json', 'data/rules/core-rules-fr.json', 'data/simulator/manifest.json', 'data/simulator/coverage.json', 'data/simulator/physical-profiles.json', 'data/simulator/scenarios.json', 'data/simulator/rulepacks.json'],
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
          globIgnores: ['assets/gdm-11th/**/*'],
          maximumFileSizeToCacheInBytes: 45 * 1024 * 1024,
          runtimeCaching: [{
            urlPattern: /\/assets\/gdm-11th\/.+\.(?:png|svg)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gdm-mission-assets',
              expiration: { maxEntries: 149, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }]
        }
      })
    ],
    test: {
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.mjs']
    }
  };
});
