import fs from 'fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const firebaseSwTemplatePath = path.resolve(__dirname, './src/sw/firebase-messaging-sw.js')

function renderFirebaseMessagingSw(mode) {
  const env = loadEnv(mode, __dirname, '')
  const template = fs.readFileSync(firebaseSwTemplatePath, 'utf8')
  const replacements = {
    __VITE_FIREBASE_API_KEY__: env.VITE_FIREBASE_API_KEY || '',
    __VITE_FIREBASE_AUTH_DOMAIN__: env.VITE_FIREBASE_AUTH_DOMAIN || '',
    __VITE_FIREBASE_DATABASE_URL__: env.VITE_FIREBASE_DATABASE_URL || '',
    __VITE_FIREBASE_PROJECT_ID__: env.VITE_FIREBASE_PROJECT_ID || '',
    __VITE_FIREBASE_STORAGE_BUCKET__: env.VITE_FIREBASE_STORAGE_BUCKET || '',
    __VITE_FIREBASE_MESSAGING_SENDER_ID__: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    __VITE_FIREBASE_APP_ID__: env.VITE_FIREBASE_APP_ID || '',
    __VITE_FIREBASE_MEASUREMENT_ID__: env.VITE_FIREBASE_MEASUREMENT_ID || '',
  }

  return Object.entries(replacements).reduce(
    (output, [token, value]) => output.replaceAll(token, value),
    template,
  )
}

function firebaseMessagingSwPlugin() {
  let mode = 'development'

  return {
    name: 'firebase-messaging-sw',
    configResolved(config) {
      mode = config.mode
    },
    configureServer(server) {
      server.middlewares.use('/firebase-messaging-sw.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.end(renderFirebaseMessagingSw(mode))
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'firebase-messaging-sw.js',
        source: renderFirebaseMessagingSw(mode),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), firebaseMessagingSwPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@modules': path.resolve(__dirname, './src/modules'),
    },
  },
  build: {
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // Perf audit FE-B3: keep only vendor buckets that measurably stay
          // lazy in the real build output (verified via dist/index.html's
          // <link rel="modulepreload"> list after each change — that's the
          // ground truth for "is this actually eager", not just what the
          // manualChunks function says). react/react-dom get their own
          // chunk since nearly everything needs them anyway. MUI and
          // Recharts are deliberately NOT force-merged into one monolithic
          // chunk each: doing so previously made each into a single shared
          // dependency of dozens of unrelated lazy-loaded admin/seller
          // pages, which made Rollup's own chunk graph hoist that whole
          // monolith into a static (eager) import of the entry point —
          // exactly the "every portal downloads MUI+Recharts up front"
          // problem this fix is for. Leaving MUI/Recharts to Rollup's
          // automatic chunking lets each lazy page that needs them pull in
          // only what it needs, without creating one grep-me-everywhere
          // shared chunk that tempts that hoisting behavior.
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react'
          }

          if (id.includes('framer-motion')) return 'vendor-motion'
          if (id.includes('firebase')) return 'vendor-firebase'
          if (id.includes('jspdf')) return 'vendor-jspdf'
          if (id.includes('html2canvas')) return 'vendor-html2canvas'
          if (id.includes('lucide-react')) return 'vendor-lucide'
        },
      },
    },
  },
})
