import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_API_URL is set in Vercel env vars to point to the Railway backend
// e.g. https://it-asset-audit-backend.up.railway.app
// Leave blank for local dev (proxy handles it)
const apiTarget = process.env.VITE_API_URL || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      }
    }
  }
});
