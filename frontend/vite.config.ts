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
   * Where Appwrite lives, worked out rather than demanded.
   *
   * Appwrite Sites injects `APPWRITE_SITE_PROJECT_ID` and
   * `APPWRITE_SITE_API_ENDPOINT` into every deployment, so a site hosted inside the
   * project already knows both — including the region, which is the part most
   * easily got wrong by hand. Falling back to them means a deployment needs no
   * environment variables of its own at all.
   *
   * An explicit VITE_ value still wins, for local development and for the case of
   * a site deployed from one project against another.
   *
   * Exposed as plain constants rather than by defining `import.meta.env.VITE_*`,
   * to stay out of the way of Vite's own env replacement instead of racing it.
   */
  const appwriteProjectId =
    env.VITE_APPWRITE_PROJECT_ID?.trim() || env.APPWRITE_SITE_PROJECT_ID?.trim() || ''
  const appwriteEndpoint =
    env.VITE_APPWRITE_ENDPOINT?.trim() || env.APPWRITE_SITE_API_ENDPOINT?.trim() || ''

  return {
    define: {
      __APPWRITE_PROJECT_ID__: JSON.stringify(appwriteProjectId),
      __APPWRITE_ENDPOINT__: JSON.stringify(appwriteEndpoint),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'robots.txt', 'icons/apple-touch-icon-180.png'],
        manifest: {
          id: '/',
          name: 'Milani Sangha Club',
          short_name: 'Milani Sangha',
          description: 'Membership, payments, events and notices for Milani Sangha Club.',
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
      // Dummy values so config/env.ts validation passes under test without
      // requiring a real .env file (or real Firebase credentials) in CI.
      env: {
        VITE_APPWRITE_ENDPOINT: 'https://test.cloud.appwrite.io/v1',
        VITE_APPWRITE_PROJECT_ID: 'test-project',
        VITE_API_BASE_URL: '/api/v1',
        VITE_CLUB_NAME: 'Milani Sangha Club',
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
