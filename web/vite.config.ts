import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      // ✅ proxy API (fixes /api/auth/me CORS)
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },

      // ✅ existing “working branch” style proxies (keep for compatibility)
      "/lot-balances": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/summary": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/receipts": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/materials": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/issues": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
