import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Host canonico dello sviluppo: l'API accetta un solo origin CORS e i cookie di
// sessione sono host-scoped, quindi `127.0.0.1` rompe login e refresh.
const CANONICAL_HOST = 'localhost'
const DEV_PORT = 5173

// Estrae l'host da un header `Host`, gestendo anche la forma IPv6 `[::1]:5173`.
function hostFromHeader(hostHeader) {
  const value = (hostHeader || '').trim().toLowerCase()
  if (!value) return ''
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1)
  return value.split(':')[0]
}

// Plugin solo-dev: rimanda su `localhost` chi apre l'app da un altro host,
// evitando errori CORS "Access-Control-Allow-Origin missing" sul refresh.
function canonicalDevHost() {
  return {
    name: 'pf-canonical-dev-host',
    apply: 'serve',
    configureServer(server) {
      // Porta realmente in ascolto (può differire da DEV_PORT con `--port`).
      const port = server.config.server.port ?? DEV_PORT
      server.middlewares.use((req, res, next) => {
        const host = hostFromHeader(req.headers.host)
        if (!host || host === CANONICAL_HOST) return next()
        res.statusCode = 302
        res.setHeader('Location', `http://${CANONICAL_HOST}:${port}${req.url || '/'}`)
        res.end()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), canonicalDevHost()],
  // Porta fissa: il backend autorizza `http://localhost:5173` (FRONTEND_URL).
  // Meglio fallire che slittare in silenzio sulla 5174 e rompere il login.
  server: { port: DEV_PORT, strictPort: true },
})
