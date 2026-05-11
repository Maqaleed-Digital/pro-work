import { defineConfig } from "vite"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * WorkCaptain customer-facing build config.
 *
 * Day 2 (2026-05-12): multi-entry build per Sponsor brief §1 + §3.
 *   - /         (apex) → public marketing landing (index.html)
 *   - /app/     SPA  → authenticated app (app.html)
 *
 * `base: '/'` so apex landing loads at root. The authenticated SPA at
 * /app/ uses hash-based routing internally (existing src/router.js)
 * so URL prefix differences don't break navigation.
 *
 * Brand variants per Sponsor B5 (workcaptain.ai vs workforce.maqaleed.ai)
 * resolve at build time from VITE_BRAND env via the __MAQ_BRAND__ define.
 *
 * Controlled-beta robots policy: public/robots.txt disallows /* during
 * the D15→D15+41 window; landing HTML carries noindex meta as belt-and-
 * braces. Lifted post-window by deploy-config flip.
 */
export default defineConfig({
  base: '/',
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3010",
      "/wos": "http://127.0.0.1:3010"
    }
  },
  build: {
    rollupOptions: {
      input: {
        landing: path.resolve(__dirname, 'index.html'),  // / apex public
        app:     path.resolve(__dirname, 'app.html'),    // /app/ SPA
      },
    },
  },
  define: {
    // Brand variant for the build. Default: workcaptain for controlled-beta.
    // Override: VITE_BRAND=maqaleed-workforce npm run build (B2G/corporate).
    __MAQ_BRAND__: JSON.stringify(process.env.VITE_BRAND || 'workcaptain'),
  },
})
