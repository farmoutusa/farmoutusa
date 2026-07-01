import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['farmoutusalogo.png', 'icon.svg'],
      workbox: {
        // Don't precache-and-serve index.html as the offline app shell — that's
        // what was causing staff to see a stale deploy after visiting the site.
        // Navigation now always tries the network first (see runtimeCaching below).
        navigateFallback: null,
        runtimeCaching: [
          {
            // Never cache Apps Script requests — each submission must hit the network
            urlPattern: /^https:\/\/script\.google\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Page loads: always try the network first so staff get the latest
            // deploy immediately. Only fall back to the cached shell if offline.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3,
            },
          },
        ],
      },
      manifest: {
        name: 'Callback VM System',
        short_name: 'CallbackVM',
        description: 'Phone timezone callback window checker — Farmoutusa',
        theme_color: '#1e3a8a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
          {
            src: 'farmoutusalogo.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
  build: {
    outDir: (process.env.NETLIFY || process.env.CF_PAGES) ? 'dist' : '../backend/public',
    emptyOutDir: true,
  },
});
