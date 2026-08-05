import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  // Empty prefix so that keys without the VITE_ prefix — which Vite keeps out
  // of the browser bundle — are still readable here.
  const env = loadEnv(mode, process.cwd(), '')

  /**
   * No `define` block for the backing service.
   *
   * An earlier version read `APPWRITE_SITE_PROJECT_ID` and
   * `APPWRITE_SITE_API_ENDPOINT` here, which Appwrite Sites injects into its own
   * deployments. Netlify never sets them, so on Netlify that path only ever
   * produced empty strings — and because src/config/env.ts then demanded a project
   * id, the build failed with a message about a variable nobody had been asked to
   * set. Every value now comes from `VITE_*` alone, all of it optional.
   */
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // 'autoUpdate', not 'prompt'. With 'prompt' the service worker waits for the
        // visitor to accept an update they may never notice, so a browser can keep
        // serving a months-old bundle — which during this project meant fixes were
        // deployed, verified live with curl, and still absent for the person testing
        // them. A club website has no reason to pin anyone to an old version.
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'robots.txt', 'icons/apple-touch-icon-180.png'],
        manifest: {
          id: '/',
          name: 'New Barrackpore Milani Sangha Club',
          short_name: 'Milani Sangha',
          description: 'Membership, payments, events and notices for New Barrackpore Milani Sangha Club.',
          lang: 'en-IN',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait-primary',
          theme_color: '#0f3d2e',
          background_color: '#ffffff',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          cleanupOutdatedCaches: true,
          navigateFallback: '/index.html',
          // API calls and auth handshakes must never be answered by the shell.
          navigateFallbackDenylist: [/^\/api\//, /^\/__\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'firebase-storage',
                expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          // Enable only when deliberately debugging the service worker; a live
          // SW in development caches aggressively and hides code changes.
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        '/api': {
          target: env.DEV_API_PROXY ?? 'http://localhost:5055',
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 900,
      // Manual chunk splitting (react / firebase / charts) is deliberately left
      // to Phase 14, where bundle size is measured before being tuned.
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      // Deliberately only the two values a test asserts against. The Appwrite
      // pair is absent so that tests run in the same zero-configuration state a
      // fresh Netlify deploy does — if that state ever stops working, a test
      // should be what notices.
      env: {
        VITE_API_BASE_URL: '/api/v1',
        VITE_CLUB_NAME: 'New Barrackpore Milani Sangha Club',
      },
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        exclude: ['src/test/**', 'src/**/*.d.ts', 'src/main.tsx'],
      },
    },
  }
})
