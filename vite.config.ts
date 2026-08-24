import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tsconfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/postcss'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  css: {
    postcss: {
      plugins: [
        tailwindcss()
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  plugins: [
    react(),
    tsconfigPaths(),
    VitePWA({
      // `prompt` (not `autoUpdate`): a freshly built service worker waits in the
      // background instead of taking over and reloading the page. The in-app
      // update banner (see `PWAUpdatePrompt`) lets the user apply it on their own
      // terms, or dismiss it and keep using the current version.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icons/**/*', 'fonts/**/*.woff2'],
      manifest: {
        name: 'Campaigns of the Mist',
        short_name: 'CotM',
        description: 'A modern, privacy-first character sheet manager for City of Mist, Otherscape, and Legend in the Mist TTRPGs.',
        id: '/',
        start_url: '/',
        scope: '/',
        // `standalone` drops the browser chrome so an installed instance uses the
        // full device screen like a native app.
        display: 'standalone',
        orientation: 'any',
        // Dark splash/status-bar tint so the cream app logo stays legible.
        theme_color: '#020817',
        background_color: '#020817',
        // The icons are full-bleed dark tiles with the cream logo centred inside
        // the maskable safe zone, so each doubles as an adaptive (`maskable`)
        // icon - Android renders the logo on the brand tile instead of dropping
        // a transparent icon onto a white plate.
        icons: [
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icons/icon-256x256.png',
            sizes: '256x256',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icons/icon-384x384.png',
            sizes: '384x384',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Precache the built app shell so it loads with no network. The bundle
        // is split into per-vendor chunks (see build.rollupOptions), each well
        // under the per-file cap, so all of them precache with room to spare.
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,webmanifest,woff2}'],
        // Headroom over Workbox's 2 MiB default per-file cap: a safety net so a
        // future heavy chunk is never silently dropped from the precache (which
        // would break offline). The real guard is keeping every chunk small.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // SPA fallback: any offline navigation resolves to the cached shell so
        // client-side routes keep working without a server round-trip.
        navigateFallback: 'index.html',
        // Drop precaches from previous deployments once the new SW activates.
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Google Fonts stylesheet: revalidate in the background so updated
            // font definitions are picked up while staying available offline.
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets'
            }
          },
          {
            // Google Fonts files: immutable and hashed, so cache-first with a
            // long expiry keeps the Inter typeface available offline.
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        // Split the vendor deps into stable, logical chunks so no single file
        // approaches Workbox's per-file precache cap and everything stays
        // precached (100% offline). Each seam isolates a self-contained
        // dependency cluster, so churn in one library never re-hashes the
        // others - keeping most precache entries reusable across releases.
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // The markdown rendering stack: react-markdown plus the entire
          // unified/remark/rehype/micromark/mdast/hast/unist/vfile ecosystem and
          // its many leaf utilities. By far the heaviest cluster; kept apart so
          // it can also be deferred with the surfaces that render prose.
          if (/[\\/]node_modules[\\/](react-markdown|remark|rehype|remark-gfm|unified|micromark|mdast|mdast-util-|micromark-|hast-util-|hastscript|property-information|space-separated-tokens|comma-separated-tokens|unist-util-|vfile|vfile-message|trim-lines|zwitch|longest-streak|ccount|markdown-table|escape-string-regexp|decode-named-character-reference|character-entities|html-url-attributes|bail|is-plain-obj|trough|devlop|estree-util-|estree-walker)/.test(id)) {
            return 'markdown-vendor'
          }

          // React core + router: the framework foundation, changes rarely.
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|use-sync-external-store)[\\/]/.test(id)) {
            return 'react-vendor'
          }

          // Radix UI primitives + cmdk (built on the same primitives).
          if (/[\\/]node_modules[\\/](@radix-ui|cmdk)[\\/]/.test(id)) {
            return 'radix-vendor'
          }

          // Animation engine.
          if (/[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) {
            return 'motion-vendor'
          }

          // Drag-and-drop engine.
          if (/[\\/]node_modules[\\/]@dnd-kit[\\/]/.test(id)) {
            return 'dnd-vendor'
          }

          // IndexedDB data layer.
          if (/[\\/]node_modules[\\/]dexie[\\/]/.test(id)) {
            return 'dexie-vendor'
          }

          // Localization runtime + language detector.
          if (/[\\/]node_modules[\\/](i18next|react-i18next|i18next-browser-languagedetector)[\\/]/.test(id)) {
            return 'i18n-vendor'
          }

          // State stores + undo history.
          if (/[\\/]node_modules[\\/](zustand|zundo)[\\/]/.test(id)) {
            return 'state-vendor'
          }

          // CodeMirror 6 editor stack (state/view/language/commands/lang-markdown) + its Lezer parsers.
          // Only the Notes editor imports it, and NoteView is React.lazy - so this chunk is pulled by the
          // lazy NoteView chunk and stays deferred + precached, never in the eager vendor bundle.
          if (/[\\/]node_modules[\\/](@codemirror|@lezer|crelt|w3c-keyname|style-mod)[\\/]/.test(id)) {
            return 'codemirror-vendor'
          }

          // pdf.js (viewer + worker glue). Only the lazy PDF surface imports it, so this
          // chunk is pulled by that lazy chunk and stays deferred + precached, never in
          // the eager vendor bundle. The worker ships as its own emitted asset.
          if (/[\\/]node_modules[\\/]pdfjs-dist[\\/]/.test(id)) {
            return 'pdf-vendor'
          }

          // Everything else falls to Rollup's default vendor grouping.
          return 'vendor'
        }
      }
    }
  },
  server: {
    port: 5173
  }
})
