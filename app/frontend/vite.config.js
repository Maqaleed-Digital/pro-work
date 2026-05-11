import { defineConfig } from "vite"

/**
 * WorkCaptain customer-facing build config.
 *
 * Per Sponsor decision B2 (2026-05-11) — brief §3.1 layout:
 * - Authenticated app mounted at /app/ (was /admin/).
 * - Public marketing surface at /index.html (apex /) is added Day 2 via
 *   rollupOptions.input multi-entry; placeholder TODO marker below.
 *
 * Brand variants per Sponsor B5 (workcaptain.ai vs workforce.maqaleed.ai)
 * are config-driven from VITE_BRAND env; resolver lives in src/brand/.
 */
export default defineConfig({
  base: '/app/',
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3010",
      "/wos": "http://127.0.0.1:3010"
    }
  },
  define: {
    // Brand variant for the build. Default to workcaptain for controlled-beta;
    // override at build time: VITE_BRAND=maqaleed-workforce npm run build (B2G/corporate).
    __MAQ_BRAND__: JSON.stringify(process.env.VITE_BRAND || 'workcaptain'),
  },
  // TODO Day 2: add rollupOptions.input for multi-entry build
  // {
  //   main: 'index.html',            // /app/ authenticated SPA
  //   landing: 'landing.html',       // / apex public marketing surface
  // }
})
