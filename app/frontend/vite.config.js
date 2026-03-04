import { defineConfig } from "vite"

export default defineConfig({
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3010",
      "/wos": "http://127.0.0.1:3010"
    }
  }
})
