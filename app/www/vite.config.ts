import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'aqeela ledger',
        short_name: 'aqeela',
        description: 'Offline store ledger for stock and sale logging',
        theme_color: '#2f2c2a',
        background_color: '#f3f3f1',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    host: true
  },
  preview: {
    host: true
  },
  optimizeDeps: {
    exclude: ['@powersync/web']
  },
  worker: {
    format: 'es'
  }
});
